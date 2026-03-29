# Copyright 2026 Giraffos
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    "name": "CuentaX - Certificado Digital",
    "version": "18.0.1.0.0",
    "category": "Accounting/Localizations",
    "summary": "Gestión de certificados digitales PFX/P12 para facturación electrónica SII",
    "description": "Almacena certificados digitales del SII Chile de forma segura "
    "para que sobrevivan reinicios del servicio de facturación.",
    "author": "Giraffos",
    "website": "https://giraffos.com",
    "license": "LGPL-3",
    "depends": ["base"],
    "data": [
        "security/cuentax_certificate_security.xml",
        "security/ir.model.access.csv",
        "views/cuentax_certificate_views.xml",
    ],
    "installable": True,
    "auto_install": False,
}
