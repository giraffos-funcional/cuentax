# -*- coding: utf-8 -*-
# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

"""Chilean employment termination (finiquito) model."""

from odoo import api, fields, models
from odoo.exceptions import UserError
from datetime import date
from dateutil.relativedelta import relativedelta
import math


class HRTermination(models.Model):
    """Finiquito / Employment Termination for Chilean labour law."""

    _name = "l10n_cl.termination"
    _description = "Finiquito / Employment Termination"
    _order = "date_termination desc"

    name = fields.Char(
        string="Reference",
        readonly=True,
        copy=False,
        default="New",
    )
    employee_id = fields.Many2one(
        "hr.employee",
        string="Employee",
        required=True,
        domain="[('company_id', '=', company_id)]",
    )
    contract_id = fields.Many2one(
        "hr.contract",
        string="Contract",
        required=True,
        domain="[('employee_id', '=', employee_id), ('state', '=', 'open')]",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Company",
        required=True,
        default=lambda self: self.env.company,
    )
    date_termination = fields.Date(
        string="Termination Date",
        required=True,
        default=fields.Date.today,
    )
    reason = fields.Selection(
        [
            ("necesidades_empresa", "Necesidades de la Empresa (Art. 161)"),
            ("renuncia", "Renuncia Voluntaria (Art. 159 N°2)"),
            ("acuerdo_partes", "Mutuo Acuerdo (Art. 159 N°1)"),
            ("art160", "Despido Justificado (Art. 160)"),
            ("vencimiento_plazo", "Vencimiento del Plazo (Art. 159 N°4)"),
            ("conclusion_trabajo", "Conclusión del Trabajo (Art. 159 N°5)"),
        ],
        string="Reason",
        required=True,
    )
    state = fields.Selection(
        [
            ("draft", "Borrador"),
            ("calculated", "Calculado"),
            ("confirmed", "Confirmado"),
            ("signed", "Firmado"),
        ],
        string="State",
        default="draft",
        required=True,
    )

    # Computed from contract
    date_start = fields.Date(
        related="contract_id.date_start",
        string="Contract Start",
        store=True,
    )
    wage = fields.Monetary(
        related="contract_id.wage",
        string="Current Wage",
        store=True,
    )
    currency_id = fields.Many2one(
        related="company_id.currency_id",
    )

    # Calculated fields
    years_service = fields.Float(
        string="Years of Service",
        compute="_compute_calculations",
        store=True,
    )
    months_service = fields.Integer(
        string="Months of Service",
        compute="_compute_calculations",
        store=True,
    )
    avg_wage_3m = fields.Monetary(
        string="Average Wage (last 3 months)",
        compute="_compute_calculations",
        store=True,
    )
    indemnizacion_anos = fields.Monetary(
        string="Indemnización por Años de Servicio",
        compute="_compute_calculations",
        store=True,
    )
    vacaciones_proporcionales = fields.Monetary(
        string="Vacaciones Proporcionales",
        compute="_compute_calculations",
        store=True,
    )
    feriado_pendiente = fields.Monetary(
        string="Feriado Legal Pendiente",
        compute="_compute_calculations",
        store=True,
    )
    sueldo_proporcional = fields.Monetary(
        string="Sueldo Proporcional",
        compute="_compute_calculations",
        store=True,
    )
    gratificacion_proporcional = fields.Monetary(
        string="Gratificación Proporcional",
        compute="_compute_calculations",
        store=True,
    )
    total_finiquito = fields.Monetary(
        string="Total Finiquito",
        compute="_compute_calculations",
        store=True,
    )

    # UF value for indemnizacion cap
    uf_value = fields.Float(
        string="UF Value",
        default=0.0,
        help="UF value for 90 UF cap on indemnización. Set from indicators.",
    )

    @api.depends(
        "employee_id",
        "contract_id",
        "date_termination",
        "reason",
        "contract_id.wage",
        "contract_id.date_start",
        "uf_value",
    )
    def _compute_calculations(self):
        for rec in self:
            if (
                not rec.contract_id
                or not rec.date_termination
                or not rec.date_start
            ):
                rec.years_service = 0
                rec.months_service = 0
                rec.avg_wage_3m = 0
                rec.indemnizacion_anos = 0
                rec.vacaciones_proporcionales = 0
                rec.feriado_pendiente = 0
                rec.sueldo_proporcional = 0
                rec.gratificacion_proporcional = 0
                rec.total_finiquito = 0
                continue

            # Years and months of service
            delta = relativedelta(rec.date_termination, rec.date_start)
            rec.years_service = delta.years + delta.months / 12.0
            rec.months_service = delta.years * 12 + delta.months

            # Average wage last 3 months (from confirmed payslips)
            payslips = self.env["hr.payslip"].search(
                [
                    ("employee_id", "=", rec.employee_id.id),
                    ("state", "=", "done"),
                    ("company_id", "=", rec.company_id.id),
                ],
                order="date_from desc",
                limit=3,
            )

            if payslips:
                rec.avg_wage_3m = sum(payslips.mapped("gross_wage")) / len(
                    payslips
                )
            else:
                rec.avg_wage_3m = rec.wage

            # --- Indemnización por años de servicio ---
            # Only for necesidades_empresa or acuerdo_partes
            if rec.reason in ("necesidades_empresa", "acuerdo_partes"):
                years_capped = min(math.floor(rec.years_service), 11)
                monthly_cap = (
                    rec.uf_value * 90
                    if rec.uf_value > 0
                    else float("inf")
                )
                base_monthly = min(rec.avg_wage_3m, monthly_cap)
                rec.indemnizacion_anos = base_monthly * years_capped
            else:
                rec.indemnizacion_anos = 0

            # --- Vacaciones proporcionales ---
            # Days worked in current year
            year_start = date(rec.date_termination.year, 1, 1)
            effective_start = max(rec.date_start, year_start)
            days_in_year = (rec.date_termination - effective_start).days
            daily_wage = rec.avg_wage_3m / 30.0
            vac_days = (days_in_year / 365.0) * 15
            rec.vacaciones_proporcionales = round(vac_days * daily_wage)

            # --- Feriado legal pendiente ---
            # Check leave allocations for unused days
            allocations = self.env["hr.leave.allocation"].search(
                [
                    ("employee_id", "=", rec.employee_id.id),
                    ("state", "=", "validate"),
                ]
            )
            total_allocated = sum(allocations.mapped("number_of_days"))
            leaves_taken = self.env["hr.leave"].search_count(
                [
                    ("employee_id", "=", rec.employee_id.id),
                    ("state", "=", "validate"),
                ]
            )
            # Simplified: remaining days * daily wage
            remaining_days = max(total_allocated - leaves_taken, 0)
            rec.feriado_pendiente = round(remaining_days * daily_wage)

            # --- Sueldo proporcional ---
            day_of_month = rec.date_termination.day
            rec.sueldo_proporcional = round(
                (day_of_month / 30.0) * rec.wage
            )

            # --- Gratificación proporcional ---
            months_current_year = rec.date_termination.month
            if effective_start.year == rec.date_termination.year:
                months_current_year = (
                    rec.date_termination.month - effective_start.month + 1
                )
            # Art. 50 tope: 4.75 IMM / 12 per month
            annual_grat = min(
                rec.wage * 12 * 0.25 / 12, 4.75 * 30000 / 12
            )
            rec.gratificacion_proporcional = round(
                annual_grat * months_current_year
            )

            # --- Total ---
            rec.total_finiquito = (
                rec.indemnizacion_anos
                + rec.vacaciones_proporcionales
                + rec.feriado_pendiente
                + rec.sueldo_proporcional
                + rec.gratificacion_proporcional
            )

    @api.model_create_multi
    def create(self, vals_list):
        """Assign sequence on creation."""
        for vals in vals_list:
            if vals.get("name", "New") == "New":
                vals["name"] = (
                    self.env["ir.sequence"].next_by_code(
                        "l10n_cl.termination"
                    )
                    or "New"
                )
        return super().create(vals_list)

    def action_calculate(self):
        """Trigger recomputation and move to calculated state."""
        for rec in self:
            if rec.state != "draft":
                raise UserError(
                    "Solo se puede calcular un finiquito en estado Borrador."
                )
            # Force recompute
            rec._compute_calculations()
            rec.state = "calculated"

    def action_confirm(self):
        """Confirm the termination and close the contract."""
        for rec in self:
            if rec.state != "calculated":
                raise UserError(
                    "Debe calcular el finiquito antes de confirmar."
                )
            rec.state = "confirmed"
            # Close the contract
            if rec.contract_id.state == "open":
                rec.contract_id.write(
                    {
                        "state": "close",
                        "date_end": rec.date_termination,
                    }
                )

    def action_sign(self):
        """Mark as signed (worker signed the document)."""
        for rec in self:
            if rec.state != "confirmed":
                raise UserError(
                    "Debe confirmar el finiquito antes de firmar."
                )
            rec.state = "signed"

    def action_reset_draft(self):
        """Reset to draft for corrections."""
        for rec in self:
            if rec.state == "signed":
                raise UserError(
                    "No se puede revertir un finiquito firmado."
                )
            rec.state = "draft"
