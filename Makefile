# Cuentax — atajos de CLI

.PHONY: help tenancy-phase tenancy-list tenancy-status

help:
	@echo "Comandos disponibles:"
	@echo "  make tenancy-list                     # lista las fases del plan multi-tenant"
	@echo "  make tenancy-phase PHASE=00           # imprime el ticket de la fase y deja el comando para correrlo con tu CLI agent"
	@echo "  make tenancy-status                   # estado actual del plan (decisiones + fases hechas)"

tenancy-list:
	@echo "Plan multi-tenant — fases disponibles:"
	@ls -1 docs/multitenancy/phase-*.md | sed 's|docs/multitenancy/||;s|\.md||'

tenancy-phase:
	@if [ -z "$(PHASE)" ]; then echo "ERROR: especifica PHASE, ej: make tenancy-phase PHASE=00"; exit 1; fi
	@FILE=$$(ls docs/multitenancy/phase-$(PHASE)-*.md 2>/dev/null | head -1); \
	if [ -z "$$FILE" ]; then echo "ERROR: no encontré phase-$(PHASE)-*.md"; exit 1; fi; \
	echo "════════════════════════════════════════════════════════════"; \
	echo " Ticket: $$FILE"; \
	echo "════════════════════════════════════════════════════════════"; \
	cat "$$FILE"; \
	echo ""; \
	echo "════════════════════════════════════════════════════════════"; \
	echo " Para ejecutarlo con Claude Code:"; \
	echo ""; \
	echo "   claude \"Ejecuta el ticket en $$FILE.\\"; \
	echo "           Lee primero AGENTS.md y docs/plan-multitenancy.md.\\"; \
	echo "           Trabaja una tarea a la vez, corre tests entre cambios,\\"; \
	echo "           commit por tarea (convencional). No avances de ticket\\"; \
	echo "           sin que yo apruebe.\""; \
	echo "════════════════════════════════════════════════════════════"

tenancy-status:
	@echo "Decisiones (docs/multitenancy/decisions.md):"
	@grep -E "^- \[(x| )\]" docs/multitenancy/decisions.md | head -20 || true
	@echo ""
	@echo "Tickets:"
	@ls -1 docs/multitenancy/phase-*.md | while read f; do \
		title=$$(head -1 "$$f" | sed 's/^# //'); \
		done_count=$$(grep -c "^- \[x\]" "$$f" 2>/dev/null || echo 0); \
		total=$$(grep -c "^- \[" "$$f" 2>/dev/null || echo 0); \
		printf "  %-40s %s/%s tareas\n" "$$title" "$$done_count" "$$total"; \
	done
