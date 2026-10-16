// Ignore only the two position expressions explicitly authorized for the shared Landing descent.
export const priorLandingPosition = text => text
  .replace('bottom: insets.bottom + SYSTEM_MARGIN_Y - landingOffsetY,', 'bottom: insets.bottom + SYSTEM_MARGIN_Y,')
  .replace('top: placement.y + landingOffsetY,', 'top: placement.y,');
