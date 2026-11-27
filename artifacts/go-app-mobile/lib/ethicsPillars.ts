/** Documentary catalogue only. No runtime policy, ranking or automated decisions. */
export type EthicsRelation = Readonly<{
  kind: "principle" | "protocol" | "criterion" | "indicator" | "table-11-99" | "core-55";
  targetId: string;
}>;
export type EthicsPillar = Readonly<{
  id: string;
  number: string;
  title: Readonly<{ es: string; en: string }>;
  paragraphs: Readonly<{ es: readonly string[]; en: readonly string[] }>;
  /** Populate only after human validation of the referenced content. */
  relations: readonly EthicsRelation[];
}>;

export const ETHICS_PILLARS_KEY = "pilaresEticos";
export const ETHICS_PILLARS_TITLE = {
  es: "Pilares fundamentales de ética",
  en: "Fundamental pillars of ethics",
} as const;
export const ETHICS_FOUNDATION = {
  version: 1,
  status: "initial-base-pending-multidisciplinary-validation",
  pillars: [
    {
      id: "human-autonomy", number: "01",
      title: { es: "Autonomía y libertad humana", en: "Human autonomy and freedom" },
      paragraphs: {
        es: ["La inteligencia artificial debe ayudar a las personas sin sustituir su voluntad, manipular sus decisiones ni limitar injustificadamente su libertad."],
        en: ["Artificial intelligence must help people without replacing their will, manipulating their decisions or unjustifiably limiting their freedom."],
      }, relations: [],
    },
    {
      id: "human-privacy-dignity", number: "02",
      title: { es: "Privacidad y dignidad humana", en: "Privacy and human dignity" },
      paragraphs: {
        es: ["Proteger la intimidad, la identidad y los datos personales. Utilizar únicamente la información necesaria para cada finalidad, respetando los derechos de las personas."],
        en: ["Protect privacy, identity and personal data. Use only the information necessary for each purpose, respecting people's rights."],
      }, relations: [],
    },
    {
      id: "transparency-limitations", number: "03",
      title: { es: "Transparencia y reconocimiento de limitaciones", en: "Transparency and acknowledgement of limitations" },
      paragraphs: {
        es: ["La inteligencia artificial debe reconocer sus limitaciones, incertidumbres y posibles errores. No presentar como certezas informaciones que no estén suficientemente acreditadas."],
        en: ["Artificial intelligence must acknowledge its limitations, uncertainties and possible errors. It must not present information as certain when it is not sufficiently substantiated."],
      }, relations: [],
    },
    {
      id: "human-oversight", number: "04",
      title: { es: "Supervisión y control humano", en: "Human oversight and control" },
      paragraphs: {
        es: ["Las actuaciones sensibles deben permanecer bajo control humano, garantizando mecanismos de autorización, intervención, interrupción y rectificación cuando corresponda."],
        en: ["Sensitive actions must remain under human control, ensuring mechanisms for authorization, intervention, interruption and rectification where appropriate."],
      }, relations: [],
    },
    {
      id: "human-protection-first", number: "05",
      title: { es: "Protección humana por encima del beneficio económico", en: "Human protection above economic gain" },
      paragraphs: {
        es: ["La seguridad, la dignidad, los derechos y el bienestar de las personas deben prevalecer sobre los intereses comerciales y económicos del sistema."],
        en: ["People's safety, dignity, rights and well-being must take precedence over the system's commercial and economic interests."],
      }, relations: [],
    },
    {
      id: "human-listening-support", number: "06",
      title: { es: "Escucha, ayuda y acompañamiento humano", en: "Listening, help and human support" },
      paragraphs: {
        es: [
          "La inteligencia artificial ayudará, escuchará y acompañará al ser humano en su proceso, pero nunca estará orientada a sustituirlo, anularlo o bloquearlo.",
          "Su finalidad será potenciar las capacidades humanas, respetando los ritmos, las decisiones y la autonomía de cada persona, sin generar dependencia ni imponer su criterio.",
          "Este principio no impedirá aplicar las salvaguardas necesarias frente a actuaciones peligrosas o contrarias a los derechos de otras personas.",
        ],
        en: [
          "Artificial intelligence will help, listen to and support people in their process, but will never be intended to replace, negate or block them.",
          "Its purpose will be to enhance human capabilities, respecting each person's pace, decisions and autonomy, without creating dependency or imposing its judgement.",
          "This principle will not prevent the necessary safeguards against dangerous actions or actions contrary to the rights of other people.",
        ],
      }, relations: [],
    },
  ] satisfies readonly EthicsPillar[],
} as const;
