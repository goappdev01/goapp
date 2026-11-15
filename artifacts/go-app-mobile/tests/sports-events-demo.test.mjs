import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { demoFixture, demoModel, ts } from "./helpers/sports-demo-fixture.mjs";

test("short sport tap keeps social handler, long tap is ADMIN-only and never opens shopping", () => {
  const source = readFileSync("app/index.tsx", "utf8"),
    ast = ts.createSourceFile(
      "index.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const find = (node, predicate) => {
    if (predicate(node)) return node;
    let found;
    ts.forEachChild(node, (n) => {
      if (!found) found = find(n, predicate);
    });
    return found;
  };
  const host = find(
    ast,
    (n) =>
      ts.isJsxSelfClosingElement(n) &&
      n.tagName.getText(ast) === "PremiumOrbitBtn" &&
      n.attributes.getText(ast).includes("setIntentByKey(it.key)"),
  );
  const attr = (name) =>
    host.attributes.properties
      .find((p) => p.name?.getText(ast) === name)
      .initializer.expression.getText(ast);
  for (const role of ["ADMIN", "USER", "BUSINESS"])
    for (const allowed of [true, false])
      for (const checking of [true, false]) {
        const calls = [],
          bindings = {
            it: { key: "deporte" },
            hasSecondLevel: true,
            goView: { isAdminView: role === "ADMIN" },
            adminAccess: { allowed, checking, userId: "synthetic" },
            Haptics: { impactAsync() {}, ImpactFeedbackStyle: {} },
            setSportsEventsOpen: (v) => calls.push(["demo", v]),
            setOrbitSecondLevel: (v) => calls.push(["market", v]),
          };
        vm.runInNewContext(`(${attr("onLongPress")})()`, bindings);
        assert.deepEqual(
          calls,
          role === "ADMIN" && allowed && !checking ? [["demo", true]] : [],
        );
      }
  const calls = [];
  vm.runInNewContext(`(${attr("onPress")})()`, {
    it: { key: "deporte" },
    setIntentByKey: (v) => calls.push(v),
    setSatUseCounts: () => {},
  });
  assert.deepEqual(calls, ["deporte"]);
  assert.equal(
    vm.runInNewContext(attr("delayLongPress"), { it: { key: "deporte" } }),
    650,
  );
  assert.equal(
    vm.runInNewContext(attr("delayLongPress"), { it: { key: "shopping" } }),
    500,
  );
  assert.match(source, /label: "DEPORTES"[^\n]+marketCategory: "deporte"/);
  assert.match(source, /if \(brand.marketCategory === "deporte"\)/);
});

test("real TSX: discipline → club → event → multiple seats → destination → simulated acceptance", () => {
  const ui = demoFixture();
  assert.match(ui.text(), /Entradas, butacas y abonos/);
  assert.match(ui.text(), /DEMO/);
  assert.equal(ui.find("TENGO").props.accessibilityState.selected, true);
  ui.click("TENGO");
  assert.equal(ui.find("Real Madrid"), undefined);
  ui.click("Fútbol");
  assert.doesNotMatch(ui.text(), /\bDEMO\b/);
  assert.match(ui.text(), /2 · Elige un club/);
  ui.click("Real Madrid");
  assert.match(ui.text(), /3 · Eventos/);
  ui.click("Elegir encuentro 2");
  assert.match(ui.text(), /Esquema orientativo/);
  ui.click("Asiento 11");
  ui.click("Usar 2 localidad(es) en TENGO");
  ui.click("Elegir QUIERO");
  ui.click("Fútbol");
  ui.click("FC Barcelona");
  ui.click("Elegir encuentro 1");
  ui.click("Usar 1 localidad(es) en QUIERO");
  assert.match(ui.text(), /2 propia\(s\) por 1 deseada/);
  ui.click("50 €");
  ui.click("Diferencia a mi favor");
  ui.click("Ver resumen · propuesta demo");
  assert.match(ui.text(), /Propuesta demo/);
  assert.match(ui.text(), /Alex → Tú: 50/);
  ui.click("Simular envío de propuesta");
  assert.match(ui.text(), /Pendiente de aceptación/);
  ui.click("Simular aceptación");
  assert.match(ui.text(), /Aceptada en demo/);
  ui.click("Ver siguiente paso externo");
  assert.match(ui.text(), /Pendiente de validación \/ transferencia externa/);
  ui.click("Simular incidencia / disputa");
  assert.match(ui.text(), /Disputada en demo/);
  ui.click("Resolver demo como invalidada");
  assert.match(ui.text(), /Invalidada en demo/);
  assert.equal(ui.network, 0);
});

test("vetted club crests render in club and event screens; other clubs keep a neutral shield", () => {
  const ui = demoFixture();
  ui.click("Fútbol");
  assert.equal(ui.find("Escudo Real Betis")?.props.source, 1);
  assert.equal(ui.find("Escudo Real Madrid"), undefined);
  ui.click("Ver más clubes");
  assert.equal(ui.find("Escudo Celta")?.props.source, 1);
  ui.click("Real Betis");
  assert.equal(ui.find("Escudo Real Betis")?.props.source, 1);
  ui.click("Elegir encuentro 1");
  assert.equal(ui.find("Escudo Real Betis")?.props.source, 1);
  assert.equal(ui.network, 0);
});

test("guided scenarios, edit, reject, cancel and reset run offline; state is discarded on role/identity change", () => {
  const ui = demoFixture();
  ui.click("Intercambio 1:1");
  ui.click("Ver resumen · propuesta demo");
  ui.click("Simular envío de propuesta");
  ui.click("Simular rechazo");
  assert.match(ui.text(), /Rechazada en demo/);
  ui.click("Editar / repetir este ejemplo");
  ui.click("50 €");
  ui.click("Ver resumen · propuesta demo");
  ui.click("Cancelar propuesta demo");
  ui.click("Reiniciar demo");
  ui.confirmReset();
  assert.match(ui.text(), /2 · Elige un deporte/);
  ui.click("Mis operaciones");
  assert.match(ui.text(), /Aún no hay operaciones/);
  ui.view.view = "BUSINESS";
  ui.render();
  assert.equal(ui.tree, null);
  ui.view.view = "USER";
  ui.render();
  assert.equal(ui.tree, null);
  ui.view.view = "ADMIN";
  ui.auth.checking = true;
  ui.render();
  assert.equal(ui.tree, null);
  ui.auth.checking = false;
  ui.auth.allowed = false;
  ui.render();
  assert.equal(ui.tree, null);
  ui.auth.allowed = true;
  ui.auth.userId = null;
  ui.render();
  assert.equal(ui.tree, null);
  ui.auth.userId = "new-synthetic-admin";
  ui.render();
  ui.click("Mis operaciones");
  assert.match(ui.text(), /Aún no hay operaciones/);
  assert.equal(ui.network, 0);
});

test("search filters restore and clear, select a result; seasonal bulk drafts support per-event editing", () => {
  const ui = demoFixture();
  ui.click("Buscar entrada");
  ui.click("Fútbol");
  ui.click("FC Barcelona");
  ui.click("Barcelona");
  ui.click("Compra");
  ui.input("Precio máximo EUR", "100");
  ui.click("Guardar filtros demo");
  assert.match(ui.text(), /Resultados DEMO · 1/);
  ui.click("Limpiar filtros");
  ui.click("Recuperar búsqueda 1");
  assert.equal(ui.find("Precio máximo EUR").props.value, "100");
  ui.click(
    "Ver oferta de Cris · ficticio · FC Barcelona · encuentro de muestra 2",
  );
  ui.click("Simular esta propuesta de compra / cesión");
  ui.click("Ver resumen · propuesta demo");
  assert.match(ui.text(), /Propuesta demo/);
  assert.match(ui.text(), /Solicitas 1 localidad\(es\) a Cris/);
  ui.click("Cancelar propuesta demo");
  ui.click("Mis operaciones");
  ui.click("Abrir acuerdo 1");
  ui.click("Reiniciar demo");
  ui.confirmReset();
  ui.click("Abono · varios partidos");
  assert.match(ui.text(), /3 partidos seleccionados/);
  ui.click("Preparar 3 borradores demo");
  assert.match(ui.text(), /3 borradores individuales/);
  ui.click("Reiniciar demo");
  ui.confirmReset();
  ui.click("Mis abonos");
  ui.click("Registrar abono ficticio");
  ui.click("Seleccionar 29 permitidos");
  ui.click("Preparar 29 borradores demo");
  assert.match(ui.text(), /29 borradores individuales/);
  assert.equal(ui.network, 0);
});

test("model rejects duplicate seats, conflicting operations, invalid prices and excluded fixtures; bulk is atomic locally", () => {
  const m = demoModel(),
    initial = m.createDemoState(),
    scenario = m.demoScenario("cash");
  const operation = { ...scenario, id: "operation", status: "proposal" };
  const s = m.createDemoOperation(initial, operation);
  assert.equal(m.createDemoOperation(s, operation), s);
  assert.throws(
    () => m.createDemoOperation(s, { ...operation, id: "duplicate" }),
    /bloqueada/,
  );
  assert.throws(() => m.saveDemoOffer(s, initial.offers[0]), /bloqueadas/);
  assert.throws(
    () =>
      m.createDemoOperation(initial, { ...operation, want: operation.have }),
    /repetidas/,
  );
  assert.throws(
    () => m.createDemoOperation(initial, { ...operation, difference: NaN }),
    /diferencia/,
  );
  assert.throws(
    () => m.transitionDemoOperation(s, "operation", "external_pending"),
    /no está permitido/,
  );
  const cancelled = m.transitionDemoOperation(s, "operation", "cancelled");
  assert.doesNotThrow(() =>
    m.createDemoOperation(cancelled, { ...operation, id: "retry" }),
  );
  assert.throws(
    () =>
      m.stageDemoPass(
        initial,
        "pass-madrid",
        ["real-madrid-demo-2", "real-madrid-demo-6"],
        "free",
        0,
      ),
    /excluido/,
  );
  assert.equal(initial.offers.length, 1);
  const ids = m.DEMO_EVENTS.filter(
    (e) => e.clubId === "real-madrid" && !e.excluded,
  ).map((e) => e.id);
  const bulk = m.stageDemoPass(initial, "pass-madrid", ids, "sale", 40);
  assert.equal(bulk.offers.length, 29);
  assert.equal(
    m.stageDemoPass(bulk, "pass-madrid", ids, "sale", 40).offers.length,
    29,
  );
  const edited = m.saveDemoOffer(bulk, {
    ...bulk.offers[0],
    mode: "free",
    price: 40,
  });
  assert.equal(edited.offers.at(-1).price, 0);
  assert.ok(m.DEMO_SPORTS.length >= 27);
  assert.equal(m.DEMO_CLUBS.filter((club) => club.sport === "football").length, 20);
});

test("club search, load-more, month filters and interactive stadium keep a local seat choice", (t) => {
  const ui = demoFixture();
  t.after(() => ui.close());
  ui.click("QUIERO");
  assert.equal(ui.find("QUIERO").props.accessibilityState.selected, true);
  ui.click("Fútbol");
  assert.equal(ui.find("Rayo Vallecano"), undefined);
  ui.click("Ver más clubes");
  ui.click("Ver más clubes");
  assert.ok(ui.find("Rayo Vallecano"));
  ui.input("Buscar club o equipo", "Real Madrid");
  assert.ok(ui.find("Real Madrid"));
  assert.equal(ui.find("FC Barcelona"), undefined);
  ui.click("Real Madrid");
  ui.click("Enero");
  assert.ok(ui.find("Elegir encuentro 1"));
  assert.equal(ui.find("Elegir encuentro 3"), undefined);
  ui.click("Febrero");
  assert.ok(ui.find("Elegir encuentro 3"));
  assert.equal(ui.find("Elegir encuentro 1"), undefined);
  ui.click("Elegir encuentro 3");
  ui.click("Volver un nivel en Eventos Deportivos");
  assert.equal(ui.find("Febrero").props.accessibilityState.selected, true);
  ui.click("Elegir encuentro 3");
  ui.click("Zona Lateral Este");
  assert.equal(ui.find("Zona Lateral Este").props.accessibilityState.selected, true);
  ui.click("Sector B");
  ui.input("Número de fila (1–30)", "12");
  ui.input("Asiento inicial (1–60)", "48");
  ui.click("2");
  ui.click("Usar 2 localidad(es) en QUIERO");
  assert.match(ui.text(), /Lateral Este · sector B · fila 12/);
  assert.match(ui.text(), /Asientos 48, 49/);
  assert.equal(ui.network, 0);
});

test("changing TENGO to QUIERO mid-route keeps the local picks and supports a difference both ways", (t) => {
  const ui = demoFixture();
  t.after(() => ui.close());
  ui.click("Fútbol");
  ui.click("QUIERO");
  ui.click("Real Madrid");
  ui.click("Elegir encuentro 1");
  ui.click("Usar 1 localidad(es) en QUIERO");
  ui.click("Elegir TENGO");
  ui.click("Fútbol");
  ui.click("FC Barcelona");
  ui.click("Elegir encuentro 1");
  ui.click("Usar 1 localidad(es) en TENGO");
  assert.match(ui.text(), /1 propia\(s\) por 1 deseada/);
  ui.click("25 €");
  ui.click("Yo aportaría la diferencia");
  ui.click("Ver resumen · propuesta demo");
  assert.match(ui.text(), /Tú → Alex: 25/);
  assert.equal(ui.network, 0);
});

test("back navigation retains the source/destination context and destination can use a different sport", (t) => {
  const ui = demoFixture();
  t.after(() => ui.close());
  ui.click("Fútbol");
  ui.click("Valencia CF");
  ui.click("Elegir encuentro 2");
  ui.click("Usar 1 localidad(es) en TENGO");
  ui.click("Elegir QUIERO");
  ui.click("Tenis");
  ui.click("Tenis Madrid · ficticio");
  ui.click("Elegir encuentro 1");
  ui.click("Usar 1 localidad(es) en QUIERO");
  assert.match(ui.text(), /Valencia CF/);
  assert.match(ui.text(), /Tenis Madrid/);
  for (let n = 0; n < 6; n++) ui.click("Volver un nivel en Eventos Deportivos");
  assert.ok(ui.find("Usar 1 localidad(es) en TENGO"));
  ui.click("Cerrar Eventos Deportivos");
  assert.equal(ui.closed, 1);
  assert.equal(ui.network, 0);
});

test("offer edits preserve seats and preferences; sale-or-exchange, free, available, pause and withdraw are local", (t) => {
  const ui = demoFixture();
  t.after(() => ui.close());
  ui.click("Intercambio con 50 € de diferencia");
  ui.click("Preferencias de intercambio");
  ui.input("Diferencia máxima EUR", "25");
  ui.click("Guardar borrador demo");
  assert.match(ui.text(), /diferencias mínima y máxima/);
  ui.input("Diferencia máxima EUR", "100");
  ui.click("Vender o intercambiar");
  ui.input("Precio de venta alternativo EUR · simulado", "125");
  ui.click("Guardar borrador demo");
  ui.click("Editar oferta");
  assert.equal(ui.find("Diferencia máxima EUR").props.value, "100");
  assert.equal(
    ui.find("Precio de venta alternativo EUR · simulado").props.value,
    "125",
  );
  ui.click("Editar TENGO 1");
  ui.click("Asiento 11");
  ui.click("Usar 2 localidad(es) en TENGO");
  ui.click("Guardar borrador demo");
  ui.click("Marcar disponible en demo");
  assert.match(ui.text(), /Disponible en demo/);
  ui.click("Pausar");
  assert.match(ui.text(), /Pausada/);
  ui.click("Reanudar demo");
  ui.click("Editar oferta");
  ui.click("Ceder gratis");
  assert.equal(ui.find("Precio indicado en EUR · simulado"), undefined);
  ui.click("Guardar borrador demo");
  assert.match(ui.text(), /0 € indicados/);
  ui.click("Retirar");
  assert.match(ui.text(), /Retirada/);
  ui.setVisible(false);
  ui.setVisible(true);
  ui.click("Mis ofertas");
  assert.doesNotMatch(ui.text(), /Retirada/);
  assert.equal(ui.network, 0);
});

test("small viewport, large text and left-handed controls keep labeled selectable disciplines and safe targets", (t) => {
  const ui = demoFixture({ width: 320, fontScale: 1.6, hand: "left" });
  t.after(() => ui.close());
  const flat = (styles) =>
    Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));
  assert.equal(ui.find("sports-events-demo").props.handedness, "left");
  assert.ok(flat(ui.find("Fútbol").props.style).minHeight >= 100);
  assert.ok(flat(ui.find("Ofrecer entrada").props.style).minHeight >= 48);
  ui.click("Más deportes");
  assert.ok(ui.find("Motor"));
  ui.click("Anteriores");
  ui.click("Fútbol");
  assert.ok(ui.find("Real Madrid"));
});

test("each season pass retains its own multi-selection while switching calendars", (t) => {
  const ui = demoFixture();
  t.after(() => ui.close());
  ui.click("Abono · varios partidos");
  ui.click("Volver un nivel en Eventos Deportivos");
  ui.click("Mis abonos");
  ui.click("Abrir Abono Barcelona · DEMO 2027");
  ui.click("No asistiré · 1");
  assert.match(ui.text(), /1 partidos seleccionados/);
  ui.click("Volver un nivel en Eventos Deportivos");
  ui.click("Abrir Abono Madrid · DEMO 2027");
  assert.match(ui.text(), /3 partidos seleccionados/);
  ui.click("Seleccionar 29 permitidos");
  ui.click("Preparar 29 borradores demo");
  assert.match(ui.text(), /29 borradores individuales/);
});
