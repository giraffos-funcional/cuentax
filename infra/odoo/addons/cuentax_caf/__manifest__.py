# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    "name": "CuentaX - CAF (Código de Autorización de Folios)",
    "version": "18.0.1.0.0",
    "category": "Accounting/Localizations",
    "summary": "Gestión de CAF del SII para facturación electrónica chilena",
    "description": "Administración de Códigos de Autorización de Folios (CAF) "
    "emitidos por el SII, incluyendo control de rangos, "
    "consumo de folios y alertas de renovación.",
    "author": "Giraffos",
    "website": "https://giraffos.com",
    "license": "LGPL-3",
    "depends": ["base"],
    "data": [
        "security/cuentax_caf_security.xml",
        "security/ir.model.access.csv",
        "views/cuentax_caf_views.xml",
    ],
    "installable": True,
    "auto_install": False,
}
