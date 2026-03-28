# Cuentax Odoo 18 — Custom image with OCA Payroll
# =================================================
# Extends official odoo:18 with OCA payroll modules
# Build: docker build -t ghcr.io/giraffos-funcional/cuentax-odoo:18 .
# Push:  docker push ghcr.io/giraffos-funcional/cuentax-odoo:18

FROM odoo:18

USER root

# Install git for cloning OCA repos + pip dependencies for payroll
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Clone OCA payroll (branch 18.0) into /opt/oca/payroll
RUN mkdir -p /opt/oca && \
    git clone --depth 1 --branch 18.0 \
      https://github.com/OCA/payroll.git /opt/oca/payroll

# Install Python dependencies required by OCA payroll modules
RUN pip3 install --no-cache-dir \
    openupgradelib

# Copy custom odoo.conf with updated addons_path
COPY odoo.prod.conf /etc/odoo/odoo.conf

USER odoo
