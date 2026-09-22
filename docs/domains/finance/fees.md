# Fees

Status: IMPLEMENTED
Scope: fee/rate resolution and planned trade cost calculations
Source of truth: `src/engine/fee.ts`, `src/engine/financialConfig.ts`
Implementation: `FeeEngine` and financial configuration
Tests: financial config + financial engine suites

## Current behavior

Fee resolution distinguishes broker rate, sales tax and relist/structure-specific inputs. Execution scenarios explicitly model maker/taker combinations.

The realized accounting engine may use configured fee profiles as `CONFIG_ESTIMATE`; transaction history alone does not claim to observe tax/broker deductions when they are absent.

## Boundary

Do not move realized-accounting rules into this document. See [Financial Truth](financial-truth.md).
