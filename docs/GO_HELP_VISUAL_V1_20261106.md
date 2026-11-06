# AYUDA V1 — ajuste visual

Base revisada: `142aa66242ee69162e34ddf4e0721ec7155c47f4`.

Los cuatro accesos existentes de AYUDA conservan nombres, dimensiones,
colores y acciones. El renderer compartido admite texto solo de forma
explícita: no monta iconos ni conserva su separación. Las demás órbitas
mantienen el renderer habitual.

El satélite AYUDA usa la mano dominante existente: derecha para diestros,
izquierda para zurdos. Busca el primer espacio libre desde la esquina
inferior de su lado, evitando los controles pintados y los paneles.
Se conserva la reserva de geometría anterior para que los otros satélites,
el globo y los paneles no cambien de posición por este ajuste.

Los dos cierres existentes del modo AYUDA usan GoCloseButton con X y sus
mismos callbacks. Conservan sus áreas táctiles originales (mínimo 44 puntos)
mediante una opción explícita del componente compartido; los consumidores
anteriores mantienen el tamaño por defecto de 64. El componente sigue usando
la opacidad persistente y el contraste aprobados. Los formularios mantienen
su flecha jerárquica y su arrastre existentes.

Validación: 69 pruebas dirigidas de accesos reales, render de textos sin
iconos, cierres, formularios, teclado, voz, adjuntos, transporte sintético,
privacidad, geometría, lateralidad, arrastre y opacidad. Las comprobaciones
de geometría conservan los hashes de las órbitas y coordenadas ajenas.
Se actualizó una aserción antigua que todavía buscaba el cierre inline
anterior, para comprobar el host compartido ya publicado en MAIN.

TypeScript, diff check y exportación iOS SDK 58 son las verificaciones
técnicas previas a publicar. No se modifica ningún servicio, permiso o dato.
La revisión visual y táctil definitiva corresponde al propietario en iPhone.
