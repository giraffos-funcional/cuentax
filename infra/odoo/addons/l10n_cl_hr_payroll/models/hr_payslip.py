# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).

from odoo import models


class HrPayslip(models.Model):
    """Extend hr.payslip for Chilean payroll specifics."""

    _inherit = "hr.payslip"

    def _get_localdict(self):
        """Inject Chilean indicators into the salary rule local dict."""
        res = super()._get_localdict()
        # Make the indicators model available in salary rule Python code
        # via the standard 'env' variable already present in localdict.
        return res
