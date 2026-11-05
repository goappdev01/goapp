const { evaluate } = require('./react-lifecycle.cjs');
const timing = evaluate('data/serviceTiming.ts');
const calendar = evaluate('data/calendarExceptions.ts', {
  './serviceTiming': timing,
  './booking': { isCloudId: timing.isStableBookingId, supabaseApiRequest() { throw Error('No live transport in isolated preparation'); } },
  './bookingTimeline': evaluate('data/bookingTimeline.ts'),
});
const direct = evaluate('data/businessDirectEntry.ts', { './serviceTiming': timing, './calendarExceptions': calendar });
const businessId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const receiptId = '44444444-4444-4444-8444-444444444444';
const context = () => ({ businessId, timezone: 'Europe/Madrid',
  services: [{ id: serviceId, name: 'Lavado + Corte', durationMinutes: 45, staffIds: [staffId] }],
  professionals: [{ id: staffId, name: 'Profesional de prueba' }], requireProfessional: true, allowDurationOverride: false, allowConcept: false });
const draft = () => ({ ...direct.selectDirectService(direct.newDirectEntry('2026-11-06', '10:15', staffId), context().services[0]), customerName: 'Cliente sintético' });
const plain = value => JSON.parse(JSON.stringify(value));
module.exports = { direct, calendar, context, draft, plain, businessId, staffId, serviceId, receiptId };
