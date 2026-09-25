#!/usr/bin/env node

const EXPECTED_STATES = Object.freeze({
  draft: 'ACTIVE',
  ready: 'CLOSING',
});

export function parsePrDraft(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

export function expectedPrWorkState(prDraft) {
  if (prDraft === true) return EXPECTED_STATES.draft;
  if (prDraft === false) return EXPECTED_STATES.ready;
  return null;
}

export function validatePrLifecycle({ mode, state, prDraft }) {
  const errors = [];

  if (mode === 'stable') {
    if (state === 'ACTIVE') {
      errors.push('stable context cannot remain ACTIVE after a delivery is merged');
    }
    return errors;
  }

  if (mode !== 'active') {
    errors.push('context lifecycle validation requires active or stable mode');
    return errors;
  }

  const expectedState = expectedPrWorkState(prDraft);
  if (expectedState && state !== expectedState) {
    const readiness = prDraft ? 'Draft' : 'Ready for Review';
    errors.push(`${readiness} PR requires current-work state ${expectedState}; manifest=${state}`);
  }

  return errors;
}
