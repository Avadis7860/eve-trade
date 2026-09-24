# Finance Overview

Status: IMPLEMENTED
Scope: planned/immediate trade finance and treasury semantics
Source of truth: `src/engine/fee.ts`, `src/engine/profit.ts`, `src/engine/financialConfig.ts`, `src/engine/treasury.ts`
Implementation: pure financial engines + treasury resolution
Tests: financial config, treasury, financial engine suites
CI gate: corporation boundary + unit

## Separation

Planned/immediate opportunity calculations use financial configuration and fee profiles. Realized accounting is a separate concern owned by Financial Truth.

Treasury selection distinguishes corporation, active character and manual budget sources. Corporation capital is not silently treated as character capital.

[Financial Truth](financial-truth.md) · [Treasury](treasury.md) · [Fees](fees.md)
