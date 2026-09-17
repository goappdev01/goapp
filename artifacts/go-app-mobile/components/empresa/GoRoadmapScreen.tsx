import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { DraggableFAB } from "@/components/DraggableFAB";
import { GoEticaScreen } from "./GoEticaScreen";

// ─── FAB button style — mismo sistema que el resto del ecosistema GO ──────────
const ETICA_FAB_BTN = {
  width: 44, height: 44, borderRadius: 13,
  backgroundColor: "#0F0F0F",
  borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  shadowColor: "#000", shadowOpacity: 0.40,
  shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  elevation: 10,
} as const;

// ─── Paleta ───────────────────────────────────────────────────────────────────
const BG   = "#0D0E11";
const CARD = "#1A1B1F";
const BORD = "rgba(255,255,255,0.08)";
const TEXT = "#FFFFFF";
const DIM  = "rgba(255,255,255,0.28)";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type RoadmapNode = {
  key:       string;
  emoji:     string;
  label:     string;
  color:     string;
  progress:  number;
  desc:      string;
  children?: RoadmapNode[];
};

// ─── English label / desc overlay maps ────────────────────────────────────────
// Keys match the `key` field of each RoadmapNode.
// If a key is absent, the original label/desc is used as-is.
const ROADMAP_LABEL_EN: Record<string, string> = {
  // root nodes
  comunicacion:    "GO COMMUNICATION",
  empresa:         "GO ENTERPRISE",
  logistica:       "GO LOGISTICS",
  ia:              "GO AI",
  negocio:         "GO BUSINESS",
  // humanity
  vulnerabilidad:  "Vulnerability",
  vecinos:         "Neighbours",
  alertas:         "Community alerts",
  conflictos:      "Conflict zones",
  mayores:         "Elderly support",
  children:        "Uber Children",
  ayudaVec:        "Neighbourhood help",
  objetosPerd:     "Lost objects",
  transpComp:      "Shared transport",
  compartirH:      "Share",
  tengoQuieroH:    "Have / Want",
  // observatory
  obs_sinHogar:    "Homeless people",
  obs_hambre:      "Hunger",
  obs_conflictos:  "Conflict zones",
  obs_mayores:     "Elderly living alone",
  obs_urgentes:    "Urgent needs",
  obs_recursos:    "Available resources",
  obs_excedentes:  "Surpluses",
  obs_donaciones:  "Available donations",
  obs_alertas:     "Community alerts",
  obs_oport:       "Social opportunities",
  obs_catastrofes: "Disasters",
  obs_salud:       "Health",
  obs_transporte:  "Transport",
  obs_desempleo:   "Unemployment",
  obs_eticos:      "Ethical indicators",
  obs_medioamb:    "Environmental indicators",
  obs_ia:          "Predictive AI",
  obs_mapa:        "World map",
  // vulnerability children
  sinHogar:        "Homeless people",
  hambre:          "Hunger",
  mayoresSolos:    "Elderly living alone",
  necesidades:     "Urgent needs",
  recursos:        "Available resources",
  excedentes:      "Surpluses",
  donaciones:      "Available donations",
  oportunidades:   "Social opportunities",
  salud:           "Health",
  transporte:      "Transport",
  desempleo:       "Unemployment",
  catastrofes:     "Disasters",
  eticos:          "Ethical indicators",
  medioamb:        "Environmental indicators",
  iaPredict:       "Predictive AI",
  mapaMundial:     "World map",
  // ethics children
  principiosGO:    "GO Principles",
  protVuln:        "Protection of vulnerable people",
  transparencia:   "Transparency",
  usoIA:           "Responsible AI use",
  derechos:        "Rights and duties",
  bienestar:       "Collective wellbeing",
  seguridad:       "Security",
  indicadores:     "Ethical indicators",
  preguntasEticas: "Ethical questions by module",
  consecuencias:   "Consequences of actions",
  // social
  comida:          "Food",
  cafe:            "Café",
  viajes:          "Travel",
  fiesta:          "Party",
  deportes:        "Sports",
  actividades:     "Activities",
  eventos:         "Events",
  compras:         "Shopping",
  otro:            "Other",
  compartirS:      "Share",
  tengoQuieroS:    "Have / Want",
  // comunicacion
  contactos:       "Contacts",
  notas:           "Notes",
  reuniones:       "Meetings",
  traduccion:      "Automatic translation",
  grupos:          "Groups",
  multinivel:      "Multi-level",
  enviosMas:       "Mass messaging",
  iaConv:          "Conversational AI",
  // empresa
  peluquerias:     "Hair salons",
  restaurantes:    "Restaurants",
  hoteles:         "Hotels",
  clinicas:        "Clinics",
  gimnasios:       "Gyms",
  autonomos:       "Self-employed professionals",
  domicilio:       "Home services",
  svcEmpresas:     "Business services",
  reservasSvc:     "Service bookings",
  extintores:      "Fire extinguishers",
  epi:             "PPE",
  auditorias:      "Audits",
  senializacion:   "Signage",
  salidas:         "Emergency exits",
  planesEvac:      "Evacuation plans",
  formacion:       "Training",
  revisiones:      "Inspections",
  docPRL:          "PRL Documentation",
  clientesPRL:     "PRL client companies",
  produccion:      "Production",
  mantenimiento:   "Maintenance",
  logInterna:      "Internal logistics",
  sensores:        "Sensors",
  alarmas:         "Alarms",
  planos:          "Industrial plans",
  averias:         "Predictive failures",
  materias:        "Raw materials",
  capacidad:       "Production capacity",
  compartirI:      "Share",
  tengoQuieroI:    "Have / Want",
  reservasEmp:     "Business bookings",
  rutasEmp:        "Business routes",
  docEmp:          "Documentation",
  comprasEmp:      "Business purchases",
  compartirE:      "Share",
  tengoQuieroE:    "Have / Want",
  // logistica
  transpPersonas:  "People transport",
  transpMercancias:"Freight transport",
  ultimaMilla:     "Last mile",
  rutasInt:        "Smart routes",
  agendaRutas:     "Schedule & routes",
  zonasTarifas:    "Zones & rates",
  compartirRutas:  "Share routes",
  flotas:          "Fleets",
  almacenes:       "Warehouses",
  gps:             "GPS tracking",
  optIA:           "AI optimisation",
  transpCompL:     "Shared transport",
  uberChildrenL:   "Uber Children link",
  // ia
  interpretacion:  "Interpretation",
  automatizacion:  "Automations",
  sugerencias:     "Suggestions",
  prediccion:      "Prediction",
  asistente:       "Personal assistant",
  iaEmpresarial:   "Business AI",
  iaEtica:         "Ethical AI",
  iaLogistica:     "Logistics AI",
  iaReservas:      "Bookings AI",
  // negocio
  suscripciones:   "Subscriptions",
  facturacion:     "Billing",
  pagos:           "Payments",
  modContratados:  "Contracted modules",
  comisiones:      "Commissions",
  licencias:       "Licences",
  inversionMod:    "Module investment",
  participaciones: "Shares by zone",
  costes:          "Costs by module",
  // missing entries
  servicios:       "GO Services",
  oportunidades:   "Social opportunities",
  etica:           "Ethics ❤️👽55👽❤️",
};

const ROADMAP_DESC_EN: Record<string, string> = {
  // root
  humanity:        "Quality of life, civic cooperation and social cohesion.",
  social:          "Everyday activities and social marketplace.",
  comunicacion:    "Relationships between people, businesses and groups.",
  empresa:         "Superior ecosystem for business activity.",
  logistica:       "Moves people, products, raw materials and services across all modules.",
  ia:              "Engine for interpretation, automation and suggestions.",
  negocio:         "Monetisation, billing and economic control.",
  // humanity children
  vulnerabilidad:  "Help for people in difficult situations and resource coordination.",
  observatory:     "Global observatory for needs, risks and opportunities. Detects where action is needed without intervening directly.",
  vecinos:         "Neighbourhood network and local community.",
  alertas:         "Community safety alerts system.",
  conflictos:      "Collaborative map of risk zones.",
  mayores:         "Support and companionship for the elderly.",
  children:        "Safe transport for minors.",
  ayudaVec:        "Support among neighbours in the same area.",
  objetosPerd:     "Lost and found system.",
  transpComp:      "Share journeys with neighbours.",
  compartirH:      "Cross-cutting engine — share resources.",
  tengoQuieroH:    "Cross-cutting engine — exchange of needs.",
  // observatory children
  obs_sinHogar:    "Real-time detection of homeless people.",
  obs_hambre:      "Zones with detected food insecurity.",
  obs_conflictos:  "Mapping of risk and conflict zones.",
  obs_mayores:     "Isolation indicators for elderly people.",
  obs_urgentes:    "Critical detected needs channel.",
  obs_recursos:    "Map of available social resources.",
  obs_excedentes:  "Localised material and food surpluses.",
  obs_donaciones:  "Active donations pending assignment.",
  obs_alertas:     "Community-reported alerts.",
  obs_oport:       "Detected opportunities for social intervention.",
  obs_catastrofes: "Emergency and disaster tracking.",
  obs_salud:       "Public health indicators by zone.",
  obs_transporte:  "Mobility and transport shortfalls.",
  obs_desempleo:   "Unemployment rates and hotspots detected.",
  obs_eticos:      "Equity and social justice metrics.",
  obs_medioamb:    "Environmental impact and sustainability.",
  obs_ia:          "Predictive models for future needs.",
  obs_mapa:        "Unified global view of the observatory.",
  // vulnerability children
  sinHogar:        "Location and support for homeless people.",
  hambre:          "Food-insecure zones and food distribution.",
  mayoresSolos:    "Support and companionship for isolated elderly people.",
  necesidades:     "Critical and immediate needs channel.",
  recursos:        "Map of available social resources for assignment.",
  excedentes:      "Material and food surpluses ready for redistribution.",
  donaciones:      "Management of financial and in-kind donations.",
  oportunidades:   "Social intervention opportunities detected by Observatory.",
  salud:           "Public health indicators and access to medical care.",
  transporte:      "Mobility shortfalls and transport access.",
  desempleo:       "Unemployment rates and hotspots for intervention.",
  catastrofes:     "Emergencies, natural disasters and humanitarian response.",
  eticos:          "Equity, social justice and wellbeing metrics.",
  medioamb:        "Environmental impact, pollution and sustainability.",
  iaPredict:       "Predictive models for future needs fed by Observatory.",
  mapaMundial:     "Unified global view — the centrepiece of GO Observatory.",
  // ethics children
  etica:           "Rules, principles and values of the GO ecosystem.",
  principiosGO:    "Ethical foundations that govern all of GO.",
  protVuln:        "Special protocol for sensitive groups.",
  transparencia:   "Clarity in algorithms, data and decisions.",
  usoIA:           "Ethical limits and criteria for GO AI.",
  derechos:        "Framework of user rights and obligations.",
  bienestar:       "Positive impact on the social fabric.",
  seguridad:       "Data protection, privacy and access.",
  indicadores:     "Ethics KPIs and continuous monitoring.",
  preguntasEticas: "Ethics checklist for each feature.",
  consecuencias:   "Traceability of the impacts of each decision.",
  // social children
  comida:          "Order food for delivery.",
  cafe:            "Book cafés and bars.",
  viajes:          "Trip planning and booking.",
  fiesta:          "Event and party organisation.",
  deportes:        "Sports facilities and activities.",
  marketplace:     "Buying and selling between individuals.",
  actividades:     "Leisure and cultural activities.",
  eventos:         "Discover and attend events.",
  compras:         "Shopping in local stores.",
  otro:            "Open category.",
  compartirS:      "Cross-cutting engine — share resources.",
  tengoQuieroS:    "Cross-cutting engine — exchange of needs.",
  // comunicacion children
  chat:            "Direct and instant messaging.",
  contactos:       "Integrated contact book.",
  notas:           "Personal and shared notes.",
  reuniones:       "Video calls and virtual meetings.",
  traduccion:      "Real-time message translation.",
  grupos:          "Conversation groups and teams.",
  multinivel:      "Multi-level hierarchical communication.",
  enviosMas:       "Notifications and mass messages.",
  iaConv:          "AI assistant integrated in chat.",
  // empresa children
  servicios:       "Services for individuals and businesses.",
  peluquerias:     "Bookings at hairdressers and barbers.",
  restaurantes:    "Restaurant bookings.",
  hoteles:         "Hotel bookings and management.",
  clinicas:        "Medical appointments and clinics.",
  gimnasios:       "Sports facility bookings.",
  autonomos:       "Directory of independent professionals.",
  domicilio:       "Services that come to the client.",
  svcEmpresas:     "B2B professional services.",
  reservasSvc:     "Integrated booking engine.",
  prl:             "Workplace risk prevention.",
  extintores:      "Fire extinguisher control and inspection.",
  epi:             "Personal protective equipment management.",
  auditorias:      "Periodic safety audits.",
  senializacion:   "Risk and safety signage.",
  salidas:         "Evacuation route control.",
  planesEvac:      "Evacuation plans and drills.",
  formacion:       "PRL training for employees.",
  revisiones:      "Periodic regulatory inspections.",
  docPRL:          "PRL document management.",
  clientesPRL:     "PRL service client portfolio.",
  industry:        "Industrial processes and production.",
  produccion:      "Production and line control.",
  mantenimiento:   "Industrial maintenance management.",
  logInterna:      "Internal material movement.",
  sensores:        "Industrial sensor network.",
  alarmas:         "Plant alarm system.",
  kpis:            "Key production indicators.",
  planos:          "Installation plans and schematics.",
  averias:         "AI-driven predictive maintenance.",
  materias:        "Raw material stock control.",
  capacidad:       "Production capacity analysis.",
  compartirI:      "Cross-cutting engine — share resources.",
  tengoQuieroI:    "Cross-cutting engine — exchange.",
  reservasEmp:     "Booking engine for businesses.",
  rutasEmp:        "Route and delivery management.",
  crm:             "Customer and relationship management.",
  docEmp:          "Business document management.",
  b2b:             "Buying and selling between businesses.",
  comprasEmp:      "Corporate purchasing management.",
  compartirE:      "Cross-cutting engine — share resources across the ecosystem.",
  tengoQuieroE:    "Cross-cutting engine — exchange.",
  // logistica children
  transpPersonas:  "On-demand people mobility.",
  transpMercancias:"Goods shipping and receiving.",
  ultimaMilla:     "Final delivery to recipient.",
  rutasInt:        "AI-powered route optimisation.",
  agendaRutas:     "Route and working day planning.",
  zonasTarifas:    "Coverage zone and pricing management.",
  compartirRutas:  "Cross-cutting engine — share journeys.",
  flotas:          "Vehicle fleet management.",
  almacenes:       "Warehouse and stock control.",
  gps:             "Real-time traceability.",
  optIA:           "AI for logistics efficiency.",
  transpCompL:     "Cross-cutting engine — shared journeys.",
  uberChildrenL:   "Link with the Uber Children module in Humanity.",
  // ia children
  interpretacion:  "Data analysis and interpretation.",
  automatizacion:  "Automated flows and actions.",
  sugerencias:     "Personalised recommendations.",
  prediccion:      "Behavioural predictive models.",
  asistente:       "Personal AI integrated in GO.",
  iaEmpresarial:   "AI focused on business processes.",
  iaEtica:         "Ethical supervision of AI models.",
  iaLogistica:     "AI for logistics optimisation.",
  iaReservas:      "Smart booking assistant.",
  // negocio children
  suscripciones:   "Module-based subscription models.",
  facturacion:     "Invoice issuance and management.",
  pagos:           "Integrated payment gateway.",
  modContratados:  "Management of active modules per business.",
  comisiones:      "Commission calculation and distribution.",
  licencias:       "Usage licence management.",
  inversionMod:    "Investor participation by module.",
  participaciones: "Investment and return by geographic zone.",
  costes:          "Cost control per module.",
};

// ─── Info explicativa (EN) — full translations matching ES depth ──────────────
const ROOT_INFO_EN: Record<string, string> = {
  humanity:
    "GO Humanity groups the modules whose main goal is to improve people's quality of life and foster cooperation among individuals, communities and society.\n\nThis block organises areas related to ethics, vulnerability, help between people and other modules oriented towards human wellbeing.\n\nIts purpose is to ensure that the technological development of the GO ecosystem always maintains a human purpose and a positive impact.",
  social:
    "GO Social groups the modules related to everyday activities and people's interaction with their surroundings.\n\nIt includes areas such as food, café, travel, sport, shopping and other activities that form part of daily life.\n\nIts goal is to connect needs, activities, services and people within the same ecosystem, making actions simple and coordinated.",
  comunicacion:
    "GO Comunicación groups the modules designed to connect people, information and actions.\n\nIt includes tools such as chat, contacts, notes and other communication and coordination systems.\n\nIts goal is to ensure that communication is not isolated, but can be linked to actions, calendars, people and other modules in the GO ecosystem.",
  empresa:
    "GO Empresa groups the modules designed to help businesses, professionals and organisations improve how they work.\n\nThis block organises business services, industry, business bookings and other modules related to operations, productivity, safety and management.\n\nIts goal is to develop modular tools that can adapt to different sectors and business needs.",
  logistica:
    "GO Logística groups the modules related to the movement and coordination of people, goods and resources.\n\nIt includes areas such as passenger transport, freight transport, last-mile delivery and other logistics systems.\n\nIts goal is to improve the coordination of routes, journeys and resources to reduce time, unnecessary kilometres and costs.",
  ia:
    "GO IA groups the artificial intelligence systems that help interpret the information in the ecosystem and turn it into useful actions.\n\nIt includes areas such as interpretation, automation, suggestions and other analysis and coordination systems.\n\nIts goal is to use the available information, within the limits and rules established by the system, to help coordinate, anticipate needs and offer better recommendations.",
  negocio:
    "GO Negocio groups the modules related to economic sustainability and financial management of the GO ecosystem.\n\nIt includes areas such as subscriptions, billing, payments and other monetisation and economic management systems.\n\nIts goal is to create different revenue streams that allow the ecosystem to be maintained, developed and scaled in a sustainable way.",
};

const MODULE_INFO_EN: Record<string, string> = {
  // GO HUMANITY (H1–H12)
  vulnerabilidad:
    "Vulnerabilidad groups the systems designed to detect real human needs and connect problems with possible solutions.\n\nIt includes areas such as GO Observatory, homeless people, hunger and other situations of risk or exclusion.\n\nIts goal is to improve the ability to observe, prioritise and coordinate help in an ethical and protected way.",
  etica:
    "Ética 55 contains the principles, limits and rules that must filter the functioning of the GO/TESO ecosystem.\n\nIts goal is to protect people, especially the most vulnerable, and to ensure privacy, transparency, security and a beneficial purpose.\n\nEthics is not decorative: it forms part of the technical decision-making flow of the system.",
  vecinos:
    "Vecinos creates a communication and cooperation network between people in the same area or community.\n\nIt allows sharing notices, needs, favours, services and local information.\n\nIts goal is to strengthen close collaboration and facilitate solutions between people who live nearby.",
  alertas:
    "Alertas ciudadanas allows communicating incidents, risks or relevant needs within a community.\n\nIts goal is to improve the available information and facilitate a coordinated response when a possible problem exists.\n\nIn the future it may be linked to priorities and urgency levels defined by the 11–99 tables.",
  conflictos:
    "Lugares conflictivos will allow identifying areas where incidents, risks or conflicts occur repeatedly.\n\nIts goal is to organise territorial information that helps understand patterns and improve prevention.\n\nIt must not automatically label or judge people; it must focus on situations, context and possible solutions.",
  mayores:
    "Ayuda personas mayores groups support, companionship, communication and coordination services for elderly people.\n\nIts goal is to reduce isolation, facilitate tasks and connect the person with family members, neighbours, professionals or services when necessary.",
  children:
    "Uber Children proposes a coordinated system for safe transport of minors.\n\nIts goal is to connect authorised responsible parties, routes, timetables, locations and confirmations to increase safety and traceability.\n\nThis module will require specific protocols for identity, permissions and child protection.",
  ayudaVec:
    "Ayuda vecinal allows requesting or offering concrete support within a community.\n\nIt may include small tasks, companionship, collections, journeys or occasional assistance.\n\nIts goal is to turn the willingness to help into organised local actions.",
  objetosPerd:
    "Objetos perdidos allows registering, locating and returning objects through information, location and community coordination.\n\nIts goal is to make it easier for whoever finds an object to connect it safely with its owner.",
  transpComp:
    "Transporte compartido connects people who make compatible journeys.\n\nIts goal is to make use of existing journeys, reduce empty vehicles, costs, traffic and emissions.\n\nIt must operate with rules on safety, identity, consent and compatibility assessment.",
  compartirH:
    "Compartir is a cross-cutting engine that allows offering or using objects, resources, spaces, time or services.\n\nIts goal is to reduce waste and make it easy for an available resource to help another person or community.",
  tengoQuieroH:
    "Tengo / Quiero connects what one person has available with what another person needs.\n\nIt can be used for exchange, lending, donation, purchase, collaboration or finding solutions.\n\nIts goal is to transform scattered needs and resources into useful connections.",

  // GO SOCIAL (S1–S12)
  comida:
    "Comida connects the user with restaurants, providers and food services.\n\nIt allows initiating actions, orders, bookings or navigation towards different options.\n\nIts goal is to simplify an everyday need and connect it with the rest of the GO ecosystem.",
  cafe:
    "Café connects the user with cafés, bars and related spaces.\n\nIt can be used to find places, book, organise meetings or access services.\n\nIts goal is to facilitate social and everyday activities quickly.",
  viajes:
    "Viajes groups planning, bookings, transport, accommodation and experiences.\n\nIts goal is to coordinate different elements of a trip within the same action flow.\n\nIt can connect with calendars, routes, payments, bookings and Marketplace.",
  fiesta:
    "Fiesta allows organising or discovering celebrations, leisure and social activities.\n\nIt can connect people, places, timetables, tickets, transport and services.\n\nIts goal is to facilitate complete coordination of a leisure activity.",
  deportes:
    "Deportes connects facilities, activities, groups, timetables and sports bookings.\n\nIts goal is to facilitate the practice of exercise and increase access to healthy activities.\n\nIt can be linked with recommendations, calendars, groups and prevention.",
  marketplace:
    "Marketplace connects users with businesses, providers, products and services through different orbits and levels of depth.\n\nIts goal is to facilitate purchases and contracts, while also generating one of the main economic sustainability streams for GO.\n\nThe Marketplace gains value as the number of users and ecosystem activity grows.",
  actividades:
    "Actividades allows discovering, creating and organising leisure, cultural, learning and social participation options.\n\nIts goal is to help people find actions suited to their interests, availability and context.",
  eventos:
    "Eventos connects the user with events, tickets, timetables, locations and participants.\n\nIts goal is to facilitate the discovery, organisation and attendance of events.\n\nIt can be linked with calendars, routes, groups and bookings.",
  compras:
    "Compras connects people with local or external shops, products and businesses.\n\nIts goal is to simplify searching for and acquiring products from within GO.\n\nIt can integrate with Marketplace, routes, promotions, zones and commissions.",
  otro:
    "Otro is an open category that avoids limiting the user's actions to previously created categories.\n\nIt allows initiating needs, activities or actions that do not yet have a specific orbit.\n\nIts goal is to keep the system open and expandable.",
  compartirS:
    "Compartir allows offering or using resources, objects, spaces or services between individuals.\n\nIts goal is to facilitate collaboration, reuse and making the most of existing resources.",
  tengoQuieroS:
    "Tengo / Quiero connects offers and needs between individuals.\n\nIt allows expressing simply what is available or what is being sought.\n\nIts goal is to generate exchanges and solutions within the community.",

  // GO COMUNICACIÓN (C1–C9)
  chat:
    "Chat allows direct and instant messaging between people, groups, businesses and services.\n\nIts goal is to turn conversations into coordination and, where appropriate, link them with actions, calendars, documents or modules.",
  contactos:
    "Contactos integrates people, businesses and relevant relationships within GO.\n\nIts goal is to allow a contact to be not just a number, but a gateway to communication, calls, meetings, bookings and shared actions.",
  notas:
    "Notas allows saving personal or shared information within the ecosystem.\n\nIts goal is to connect ideas, reminders and content with people, calendars, actions or projects.",
  reuniones:
    "Reuniones coordinates video calls, in-person meetings, participants, timetables and documentation.\n\nIts goal is to facilitate the preparation, execution and follow-up of meetings.",
  traduccion:
    "Traducción automática will facilitate communication between people who speak different languages.\n\nIts goal is to reduce language barriers in conversations, services, businesses and communities.",
  grupos:
    "Grupos allows organising conversations, people and actions in shared spaces.\n\nIts goal is to facilitate the coordination of families, teams, communities, businesses or projects.",
  multinivel:
    "Multinivel organises communication in different layers, responsibilities or hierarchical levels.\n\nIts goal is to allow information to reach the right people without generating unnecessary noise for the entire system.",
  enviosMas:
    "Envíos masivos allows distributing messages, notices or notifications to multiple recipients.\n\nIts goal is to improve the organised communication of businesses, communities, services or emergencies.\n\nIt must include controls to prevent abuse, saturation and unauthorised communications.",
  iaConv:
    "IA conversacional integrates intelligent assistance within GO communication.\n\nIts goal is to help understand messages, organise information, suggest actions and connect conversations with other modules.",

  // GO EMPRESA (E1–E11)
  servicios:
    "GO Servicios groups tools for businesses and professionals that offer services to people.\n\nIt includes sectors such as hairdressers, restaurants, hotels, clinics, gyms and others.\n\nIts goal is to provide a modular base adaptable to each type of activity.",
  industry:
    "GO Industry groups production processes, maintenance, internal logistics, operations and industrial control.\n\nIts goal is to detect losses, improve coordination and adapt GO to different productive environments.",
  reservasEmp:
    "Reservas empresa allows businesses and professionals to publish availability and receive bookings.\n\nIts goal is to attract users, generate economic activity and coordinate calendars between clients, businesses and professionals.\n\nIn addition to monetisation, it produces useful context about future actions, always protected by the ethical system.",
  rutasEmp:
    "Rutas empresa allows organising journeys, deliveries, visits and business services.\n\nIts goal is to reduce time, kilometres, duplications and coordination costs.",
  crm:
    "CRM organises clients, relationships, opportunities and business communications.\n\nIts goal is to centralise the relationship history with each client and connect it with actions, bookings and services.",
  docEmp:
    "Documentación allows organising files, forms, contracts, reports and business records.\n\nIts goal is to connect documentary information with processes, people, tasks and modules.",
  b2b:
    "Marketplace B2B connects businesses that need to buy, sell, contract or collaborate with other businesses.\n\nIts goal is to facilitate commercial operations and find suitable resources or suppliers.",
  comprasEmp:
    "Compras empresa helps organise acquisitions, suppliers, needs and corporate costs.\n\nIts goal is to improve planning and reduce uncoordinated or inefficient purchases.",
  compartirE:
    "Compartir is the cross-cutting engine of the entire GO platform for offering or requesting resources between organisations.\n\nIt allows collaborating using vehicles, spaces, machinery, staff, infrastructure, raw materials, warehouses, transport and productive capacity.\n\nIts goal is to reduce underused resources and connect available capacity with real needs within the ecosystem.\n\nWhat changes between users is only the permissions, visible categories and access filters; the engine is always the same.",
  tengoQuieroE:
    "Tengo / Quiero allows a business to publish what it has available or what it needs.\n\nIts goal is to facilitate exchange, purchase, rental, collaboration and reuse of business resources.",

  // GO LOGÍSTICA (L1–L13)
  transpPersonas:
    "Transporte personas organises mobility, timetables, routes and services for passengers.\n\nIts goal is to coordinate journeys safely, efficiently and adapted to each need.",
  transpMercancias:
    "Transporte mercancías coordinates shipments, collections, deliveries and product movement.\n\nIts goal is to improve visibility, planning and the use of routes and vehicles.",
  ultimaMilla:
    "Última milla manages the final delivery phase to the recipient.\n\nIts goal is to reduce failed deliveries, repeated journeys, waiting times and costs in the most complex phase of distribution.",
  rutasInt:
    "Rutas inteligentes optimises routes using information on destinations, times, priorities and resources.\n\nIts goal is to find more efficient combinations and adapt to changes during operation.",
  agendaRutas:
    "Agenda y rutas connects timetables, tasks, visits and journeys.\n\nIts goal is to build realistic working days taking into account duration, location and travel time.",
  zonasTarifas:
    "Zonas y tarifas organises coverage areas, economic rules and territorial multipliers.\n\nIts goal is to adapt prices and operations to the specific conditions of each zone.",
  compartirRutas:
    "Compartir rutas allows combining compatible journeys between people or businesses.\n\nIts goal is to make use of kilometres that are already going to be covered and reduce empty or duplicate trips.",
  flotas:
    "Flotas organises vehicles, availability, maintenance, utilisation and assignments.\n\nIts goal is to improve the use of each vehicle and reduce inactivity or overload.",
  almacenes:
    "Almacenes coordinates locations, stock, inflows, outflows and internal movements.\n\nIts goal is to improve traceability and reduce losses, errors and search times.",
  gps:
    "Seguimiento GPS provides authorised and real-time traceability of routes, vehicles or deliveries.\n\nIts goal is to improve coordination, safety and the ability to respond to incidents.",
  optIA:
    "Optimización IA will use artificial intelligence to analyse logistics operations and propose improvements.\n\nIts goal is to anticipate problems, compare alternatives and reduce wasted time, costs and resources.",
  transpCompL:
    "Transporte compartido connects compatible journeys for people, businesses or goods.\n\nIts goal is to make use of available capacity and reduce unnecessary journeys.",
  uberChildrenL:
    "Uber Children conexión links the logistics module with safe transport for minors.\n\nIts goal is to apply routes, timetables, tracking and coordination under specific child protection protocols.",

  // GO IA (AI1–AI9)
  interpretacion:
    "Interpretación analyses information, context and relationships between modules.\n\nIts goal is to transform scattered data into a structured understanding that can be used within the authorised limits.",
  automatizacion:
    "Automatizaciones allows executing repetitive flows and actions in a coordinated way.\n\nIts goal is to reduce manual work and connect different modules without losing control or traceability.",
  sugerencias:
    "Sugerencias offers recommendations adapted to the permitted context of each person or situation.\n\nIts goal is to help at the right moment without replacing human decision-making.",
  prediccion:
    "Predicción compares states, patterns and possible future consequences.\n\nIts goal is to anticipate needs or risks and assess how much each alternative could improve or worsen.\n\nIt must not be presented as certainty, but as an estimate that must be measured again.",
  asistente:
    "Ayudante personal integrates artificial intelligence assistance into the daily use of GO.\n\nIts goal is to help organise, remember, coordinate and connect needs with actions.",
  iaEmpresarial:
    "IA empresarial applies analysis and automation systems to business and organisational processes.\n\nIts goal is to detect inefficiencies, support decisions and improve operations.",
  iaEtica:
    "IA ética supervises that artificial intelligence models and actions respect the rules, limits and purpose of the ecosystem.\n\nIts goal is to reduce inappropriate uses and ensure that each intervention is authorised and justified.",
  iaLogistica:
    "IA logística analyses routes, loads, times, resources and transport operations.\n\nIts goal is to propose alternatives that improve logistics efficiency.",
  iaReservas:
    "IA de reservas helps coordinate availability, preferences, timetables and possible professionals or services.\n\nIts goal is to simplify the booking process and improve the assignment of relevant options.",

  // GO NEGOCIO (B1–B9)
  suscripciones:
    "Suscripciones organises access plans and recurring services.\n\nIts goal is to allow different levels of use and create stable income to sustain the ecosystem.",
  facturacion:
    "Facturación manages the issuance, receipt and organisation of invoices and income.\n\nIts goal is to connect economic activity with businesses, modules and services in a traceable way.",
  pagos:
    "Pagos integrates gateways and payment methods for ecosystem transactions.\n\nIts goal is to facilitate secure payments between users, businesses, professionals and modules.",
  modContratados:
    "Módulos contratados allows controlling which tools each business or client has activated.\n\nIts goal is to offer a modular structure in which each organisation pays for and uses only what it needs.",
  comisiones:
    "Comisiones calculates and distributes income generated by sales, bookings, partners, routes, zones or other activities.\n\nIts goal is to automate complex economic models with transparency and traceability.",
  licencias:
    "Licencias organises usage rights, conditions, territories and duration of access to modules or technology.\n\nIts goal is to allow different deployment and expansion models.",
  inversionMod:
    "Inversión por módulos allows linking financing with specific parts of the ecosystem.\n\nIts goal is to make it possible for different modules to be developed with independent budgets, teams and objectives.",
  participaciones:
    "Participaciones por zona organises investment, returns or economic collaboration linked to specific territories.\n\nIts goal is to allow expansion models adapted to countries, regions or cities.",
  costes:
    "Costes por módulo records and estimates the development, maintenance, infrastructure and operation of each part of GO.\n\nIts goal is to improve planning, budgets and investment decisions.",
};

const LEVEL3_INFO_EN: Record<string, string> = {
  // ── GO EMPRESA > GO Industry ──────────────────────────────────────────
  produccion:
    "Producción organises the work lines, production processes and different phases needed to manufacture a product or carry out an industrial activity.\n\nIts goal is to know what is being produced, what state each process is in and where time, resources or capacity may be lost.\n\nThis information can be connected with maintenance, sensors, alarms, internal logistics and other industrial modules.",
  mantenimiento:
    "Mantenimiento organises the inspections, repairs, incidents and technical needs of facilities, vehicles and machinery.\n\nIts goal is to reduce breakdowns, unexpected downtime and costs resulting from insufficient planning.\n\nIn the future it can be linked with sensors, fault history, available parts and predictive maintenance.",
  logInterna:
    "Logística interna coordinates the movement of materials, products, tools and resources within an industrial facility.\n\nIts goal is to reduce waiting times, unnecessary journeys, bottlenecks and lack of materials at work stations.\n\nIt can be connected with production, warehouses, internal routes, tasks and operational capacity.",
  sensores:
    "Sensores groups information obtained from devices that measure the state of machines, facilities, processes or environmental conditions.\n\nIts goal is to convert physical signals into useful information to detect changes, incidents and improvement opportunities.\n\nThe information must be used within the permissions, limits and protocols defined by the system.",
  alarmas:
    "Alarmas organises alerts related to failures, risks, deviations or situations requiring attention.\n\nIts goal is for each alert to reach the right people with an understandable priority and context.\n\nIn the future it may use levels, urgencies and priorities related to the 11–99 tables, but that logic must not be implemented yet.",
  kpis:
    "KPIs brings together the main indicators used to measure the performance of industrial activity.\n\nThey may include production, times, costs, quality, incidents, capacity, maintenance and other relevant results.\n\nIts goal is to show how the operation is evolving and facilitate decisions based on real information.",
  planos:
    "Planos industriales organises plans of facilities, machinery, zones, routes, safety elements and space layouts.\n\nIts goal is to connect the physical representation of the business with tasks, incidents, maintenance, emergencies and other modules.\n\nThis allows a clearer understanding of where each action takes place within the facility.",
  averias:
    "Fallos predictivos proposes the analysis of signals and patterns that could anticipate a possible breakdown or loss of performance.\n\nIts goal is to help take action before the problem causes a stoppage, an accident or a greater cost.\n\nPredictions are estimates and must be verified through new measurements; they must not be treated as automatic certainties.",
  materias:
    "Materias primas organises stocks, needs, consumption and availability of materials used during production.\n\nIts goal is to reduce supply shortages, excess inventory, waste and poorly coordinated purchases.\n\nIt can be connected with production, warehouses, suppliers, purchasing and planning.",
  capacidad:
    "Capacidad de producción analyses how much a facility can realistically produce over a given period.\n\nIt takes into account resources, staff, machinery, times, maintenance and possible limitations.\n\nIts goal is to help plan realistic workloads and detect unused capacity or overload.",
  compartirI:
    "Compartir is a cross-cutting engine that allows businesses or industrial areas to offer resources they are not using fully.\n\nThis may include machinery, vehicles, spaces, materials, tools, staff or productive capacity.\n\nIts goal is to connect available resources with real needs and reduce underuse and costs.",
  tengoQuieroI:
    "Tengo / Quiero allows a business to indicate what resources it has available and which ones it needs.\n\nIt can be used for exchange, purchase, rental, transfer, collaboration or finding suppliers.\n\nIts goal is to transform scattered capacity and needs into opportunities for industrial cooperation.",

  // ── GO EMPRESA > GO Servicios ─────────────────────────────────────────
  peluquerias:
    "Peluquerías adapts GO Servicios tools to hairdressing, beauty and personal care businesses.\n\nIt allows organising professionals, treatments, timetables, availability and bookings.\n\nIts goal is to facilitate business management and simplify the client's search and booking of the service they need.",
  restaurantes:
    "Restaurantes organises bookings, availability, timetables, tables, services and customer care.\n\nIts goal is to improve coordination between the establishment and people who wish to book or use its services.\n\nIt can be connected with Marketplace, calendars, groups, events, routes and payments.",
  hoteles:
    "Hoteles proposes tools for managing availability, bookings, services, rooms and guest care.\n\nIts goal is to connect accommodation, calendar, additional services, experiences and journeys within the same flow.\n\nIt can be adapted to hotels, independent accommodation and other types of lodging.",
  clinicas:
    "Clínicas organises appointments, professionals, timetables, services and administrative care.\n\nIts goal is to simplify coordination between the person and the centre, always respecting the privacy and sensitivity of the information.\n\nAny future healthcare function must have specific protocols, permissions and limits.",
  gimnasios:
    "Gimnasios organises facility bookings, classes, activities, trainers and timetables.\n\nIts goal is to facilitate access to exercise and improve coordination between users, professionals and sports centres.\n\nIt can be connected with calendars, groups, recommendations and other wellbeing modules.",
  autonomos:
    "Profesionales autónomos allows self-employed workers to publish their services, availability and work areas.\n\nIts goal is to offer a simple structure for receiving clients, organising bookings and coordinating their activity.\n\nIt can adapt to multiple professions without needing a different application for each sector.",
  domicilio:
    "Servicios a domicilio organises professionals and businesses that travel to the client's location.\n\nThis may include repairs, cleaning, care, maintenance, assistance and other services.\n\nIts goal is to coordinate availability, location, route, duration, price and service confirmation.",
  svcEmpresas:
    "Servicios empresariales connects businesses with professionals or providers specialised in B2B needs.\n\nThis may include consultancy, maintenance, training, documentation, technology and other professional services.\n\nIts goal is to make it easy for each business to find and coordinate the specialised help it needs.",
  reservasSvc:
    "Reservas de servicios is the integrated engine that connects clients, businesses, professionals, calendars and availability.\n\nIts goal is to facilitate real bookings, attract recurring users and generate economic activity within the ecosystem.\n\nBeyond economic value, bookings generate authorised context about future actions that can help better coordinate other modules.",
  prl:
    "GO PRL groups the modules designed for workplace risk prevention and safety improvement in businesses and workplaces.\n\nIt includes areas such as fire extinguishers, protective equipment, audits, training, planning and other preventive controls.\n\nIts goal is to help detect risks, coordinate obligations and reduce accidents through organised information and actions.",

  // ── GO EMPRESA > GO Servicios > GO PRL ────────────────────────────────
  extintores:
    "GO Extintores organises the location, inspection, maintenance and control of all fire extinguishers in a business.\n\nIts goal is to ensure that each extinguisher is operational, correctly signposted and available when needed.\n\nIt can be connected with inspections, industrial plans, audits, alarms and PRL documentation.",
  epi:
    "GO EPI organises the delivery, control and monitoring of personal protective equipment used by each worker.\n\nIts goal is to ensure that each person has the right equipment for their post and that its use can be verified.\n\nIt can be linked with training, PRL documentation, audits and inspections.",
  auditorias:
    "GO Auditorías organises internal and external inspections to verify compliance with preventive regulations.\n\nIts goal is to detect deviations, improve processes and facilitate the monitoring of corrective actions.\n\nIt can be connected with PRL documentation, inspections, signage and training.",
  senializacion:
    "GO Señalización organises all safety signage present in facilities, work areas and routes.\n\nIts goal is to ensure that preventive information is visible, correct and up to date.\n\nIt can be linked with industrial plans, emergency exits, audits and inspections.",
  salidas:
    "GO Salidas de emergencia organises evacuation routes, emergency doors and exit routes in a facility.\n\nIts goal is to ensure quick and safe evacuations in the event of an incident.\n\nIt can be connected with industrial plans, evacuation plans, signage and audits.",
  planesEvac:
    "GO Planes de evacuación organises the protocols, routes and drills for evacuating a business.\n\nIts goal is to prepare workers and managers to act correctly in an emergency.\n\nIt can be linked with training, emergency exits, industrial plans and alarms.",
  formacion:
    "GO Formación organises courses, certificates, refreshers and training actions related to workplace risk prevention.\n\nIts goal is to keep workers' and managers' knowledge up to date on preventive matters.\n\nIt can be connected with PPE, audits, PRL documentation and PRL client businesses.",
  revisiones:
    "GO Revisiones organises mandatory periodic inspections and preventive checks of facilities and equipment.\n\nIts goal is to ensure that all inspections are carried out on schedule and correctly recorded.\n\nIt can be linked with fire extinguishers, signage, audits and PRL documentation.",
  docPRL:
    "GO Documentación PRL organises certificates, reports, records, assessments and all preventive documentation for the business.\n\nIts goal is to centralise information to facilitate consultations, inspections and regulatory compliance.\n\nIt can be connected with audits, training, inspections and PRL client businesses.",
  clientesPRL:
    "GO Empresas cliente PRL organises the portfolio of businesses managed by a prevention service or specialist consultancy.\n\nIts goal is to centralise each client's preventive information and facilitate the monitoring of their obligations.\n\nIt can be linked with all GO PRL modules, allowing each business to be managed from a single platform.",

  // ── GO HUMANITY > Ética ❤️👽55👽❤️ ───────────────────────────────────
  principiosGO:
    "Principios GO gathers the ethical foundations that guide the entire ecosystem.\n\nIt defines what purpose technology must pursue, what limits must not be crossed and what values must be maintained throughout its evolution.\n\nIts goal is to ensure that all technical and economic decisions are subordinated to the protection and benefit of people.",
  protVuln:
    "Protección de personas vulnerables establishes special rules for situations in which a person may face a risk, a disadvantage or a reduced ability to defend their interests.\n\nIts goal is to increase protection, reduce possible abuses and require stricter controls the greater the vulnerability.",
  transparencia:
    "Transparencia seeks to enable people to understand what information is used, for what purpose and what effect a system action may produce.\n\nIts goal is to avoid hidden or incomprehensible processes and facilitate clear explanations about data, decisions and results.",
  usoIA:
    "Uso responsable de la IA defines limits and criteria so that artificial intelligence acts safely, proportionally and oriented towards helping.\n\nIts goal is to prevent harmful, invasive, coercive or misguided uses of the ecosystem.\n\nAI must operate with different levels of autonomy depending on the risk, impact and reversibility of each action.",
  derechos:
    "Derechos y deberes organises the rights that users, businesses, professionals and communities must retain, together with the responsibilities associated with using the system.\n\nIts goal is to maintain a balance between freedom, protection, collaboration and accountability.",
  bienestar:
    "Bienestar colectivo analyses how an action can affect not only one person, but also groups, communities and society.\n\nIts goal is to seek solutions that generate a broad positive outcome without ignoring individual rights.\n\nThis does not mean that collective wellbeing allows one person to be unjustly harmed.",
  seguridad:
    "Seguridad gathers the controls needed to protect data, identity, access, privacy and the functioning of the ecosystem.\n\nIts goal is to prevent the loss, manipulation, leakage or unauthorised use of information.\n\nThe more sensitive the information, the higher its protection levels must be.",
  indicadores:
    "Indicadores éticos allows continuously measuring whether a module, decision or action is meeting the established principles.\n\nIts goal is to detect deviations and compare how much the state of people and the system improves or worsens.\n\nIn the future it may be connected with the 11–99 tables, but that logic must not be implemented yet.",
  preguntasEticas:
    "Preguntas éticas por módulo establishes a specific review for each feature before it is developed, activated or modified.\n\nIt can analyse who benefits, who could be harmed, what information is needed, what limits must exist and what consequences may arise.\n\nIts goal is to prevent a technically possible solution from being implemented without first understanding its human impact.",
  consecuencias:
    "Consecuencias de las acciones records and analyses what effects each decision produces after it is executed.\n\nIts goal is to compare the expected result with the actual result, detect side effects and re-measure the system.\n\nIt also considers that not intervening can be a selected and measured response when protocols indicate it is the appropriate option.",

  // ── GO HUMANITY > Vulnerabilidad ──────────────────────────────────────
  observatory:
    "GO Observatory is the global detection and observation layer of the ecosystem.\n\nIt identifies needs, vulnerabilities and risk situations so that the rest of the modules can understand where help or intervention may be needed.\n\nIts goal is to observe without intervening directly, offering useful and protected information to the rest of the system.",
  sinHogar:
    "Personas sin hogar identifies and coordinates support for people without stable housing.\n\nIt helps connect detected needs with available help and resources.\n\nIts goal is to improve the ability to respond to homelessness situations in an ethical and protected way.",
  hambre:
    "Hambre identifies situations of food insecurity and nutrition needs.\n\nIt helps coordinate available food, resources and aid with the people or areas that need them.\n\nIts goal is to reduce hunger by enabling a faster connection between need and resource.",
  mayoresSolos:
    "Personas mayores solas focuses on detecting and supporting elderly people who live without company.\n\nIt can help coordinate companionship, assistance, monitoring or help when needed.\n\nIts goal is to reduce isolation and improve care for this group.",
  necesidades:
    "Necesidades urgentes identifies critical and immediate needs that require a quick response.\n\nIt allows prioritising and coordinating an agile response to these situations.\n\nIts goal is to reduce the time between detecting an urgent need and addressing it.",
  recursos:
    "Recursos disponibles organises and maps available social and humanitarian resources.\n\nIt allows connecting them with needs detected in other modules.\n\nIts goal is to make better use of existing resources, preventing them from going unused.",
  excedentes:
    "Excedentes identifies surplus materials, food or other resources that could be reused instead of wasted.\n\nIt helps redirect them to whoever may need them.\n\nIts goal is to reduce waste and increase the use of what already exists.",
  donaciones:
    "Donaciones disponibles helps organise and coordinate financial, material or other types of donations.\n\nIt allows connecting them with the right needs in an orderly way.\n\nIts goal is to ensure each donation reaches where it can generate the most benefit.",
  oportunidades:
    "Oportunidades sociales identifies situations where an intervention, collaboration or available help could improve a specific context.\n\nIt helps detect where an action can generate a real benefit.\n\nIts goal is to turn protected information into concrete opportunities for help.",
  salud:
    "Salud observes vulnerability indicators related to health.\n\nIt helps improve visibility, prevention and the coordination of necessary healthcare.\n\nIts goal is to detect health needs before they worsen.",
  transporte:
    "Transporte identifies mobility limitations that can prevent access to essential services, work, healthcare or help.\n\nIt helps make these barriers visible so they can be better coordinated.\n\nIts goal is to improve people's access to what they need, regardless of their mobility.",
  desempleo:
    "Desempleo observes vulnerability related to unemployment.\n\nIt helps identify areas or groups where support and job opportunities may be needed.\n\nIts goal is to facilitate a more agile response to unemployment situations.",
  catastrofes:
    "Catástrofes identifies and organises information related to natural disasters, emergencies and other large-scale events.\n\nIt helps coordinate a faster and more orderly response.\n\nIts goal is to improve the ability to react to exceptional situations.",
  eticos:
    "Indicadores éticos observes metrics related to equity, social justice, wellbeing and the human impact of situations and actions.\n\nIt helps verify whether the system is meeting its principles.\n\nIts goal is to always maintain an ethical orientation in ecosystem decisions.",
  medioamb:
    "Indicadores medioambientales observes environmental conditions and impacts that can generate or increase human vulnerability.\n\nIt helps anticipate problems related to the environment.\n\nIts goal is to connect environmental information with the protection of people.",
  iaPredict:
    "IA predictiva is a future layer that will use available data and patterns to help anticipate possible needs or vulnerability situations.\n\nIt will always be subject to GO's ethical principles and human supervision.\n\nIts goal is to anticipate without ever replacing human decision-making.",
  mapaMundial:
    "Mapa mundial offers the unified global view of vulnerability information, needs, resources and relevant indicators in the ecosystem.\n\nIt allows understanding at a glance the overall state of detected situations.\n\nIts goal is to centralise all Vulnerability information in a single clear view.",
};

// ─── Helpers de estado ────────────────────────────────────────────────────────
function statusFromProgress(p: number, lang: string): string {
  if (p === 100) return lang === 'en' ? "Done"        : "Terminado";
  if (p >= 70)   return lang === 'en' ? "Almost done" : "Casi listo";
  if (p >= 30)   return lang === 'en' ? "Advanced"    : "Avanzado";
  if (p > 0)     return lang === 'en' ? "In progress" : "En progreso";
  return lang === 'en' ? "Pending" : "Pendiente";
}
function statusColor(p: number): string {
  if (p === 100) return "#3D9A84";
  if (p >= 70)   return "#22c55e";
  if (p >= 30)   return "#f97316";
  if (p > 0)     return "#4A80BD";
  return "rgba(255,255,255,0.22)";
}

// ─── Info explicativa (ES fijo) de los 7 bloques madre ───────────────────────
// TEMPORAL: presentación/grabación — el contenido de estos modales se muestra
// siempre en español, independientemente del idioma activo de la app.
const ROOT_INFO_ES: Record<string, string> = {
  humanity:
    "GO Humanity agrupa los módulos cuyo objetivo principal es mejorar la calidad de vida de las personas y favorecer la cooperación entre individuos, comunidades y sociedad.\n\nDentro de este bloque se organizan áreas relacionadas con la ética, la vulnerabilidad, la ayuda entre personas y otros módulos orientados al bienestar humano.\n\nSu finalidad es que el desarrollo tecnológico del ecosistema GO mantenga siempre un propósito humano y un impacto positivo.",
  social:
    "GO Social agrupa los módulos relacionados con las actividades cotidianas y la interacción de las personas con su entorno.\n\nIncluye áreas como comida, café, viajes, deporte, compras y otras actividades que forman parte de la vida diaria.\n\nSu objetivo es conectar necesidades, actividades, servicios y personas dentro de un mismo ecosistema, facilitando acciones de una manera sencilla y coordinada.",
  comunicacion:
    "GO Comunicación agrupa los módulos destinados a conectar personas, información y acciones.\n\nIncluye herramientas como chat, contactos, notas y otros sistemas de comunicación y coordinación.\n\nSu objetivo es que la comunicación no quede aislada, sino que pueda relacionarse con acciones, calendarios, personas y otros módulos del ecosistema GO.",
  empresa:
    "GO Empresa agrupa los módulos destinados a ayudar a empresas, profesionales y organizaciones a mejorar su funcionamiento.\n\nDentro de este bloque se organizan servicios empresariales, industria, reservas para empresas y otros módulos relacionados con operaciones, productividad, seguridad y gestión.\n\nSu objetivo es desarrollar herramientas modulares que puedan adaptarse a diferentes sectores y necesidades empresariales.",
  logistica:
    "GO Logística agrupa los módulos relacionados con el movimiento y la coordinación de personas, mercancías y recursos.\n\nIncluye áreas como transporte de personas, transporte de mercancías, última milla y otros sistemas logísticos.\n\nSu objetivo es mejorar la coordinación de rutas, desplazamientos y recursos para reducir tiempos, kilómetros innecesarios y costes.",
  ia:
    "GO IA agrupa los sistemas de inteligencia artificial que ayudan a interpretar la información del ecosistema y convertirla en acciones útiles.\n\nIncluye áreas como interpretación, automatizaciones, sugerencias y otros sistemas de análisis y coordinación.\n\nSu objetivo es utilizar la información disponible, dentro de los límites y reglas establecidos por el sistema, para ayudar a coordinar, anticipar necesidades y ofrecer mejores recomendaciones.",
  negocio:
    "GO Negocio agrupa los módulos relacionados con la sostenibilidad económica y la gestión financiera del ecosistema GO.\n\nIncluye áreas como suscripciones, facturación, pagos y otros sistemas de monetización y gestión económica.\n\nSu objetivo es crear diferentes vías de ingresos que permitan mantener, desarrollar y escalar el ecosistema de forma sostenible.",
};

// Claves de los 7 bloques madre (para distinguir nivel 1 → nivel 2 en NodeDetail).
const ROOT_KEYS = ["humanity", "social", "comunicacion", "empresa", "logistica", "ia", "negocio"];

// ─── Info explicativa (ES fijo) de los módulos internos de nivel 2 ───────────
// TEMPORAL: presentación/grabación — mismo criterio que ROOT_INFO_ES.
const MODULE_INFO_ES: Record<string, string> = {
  // GO HUMANITY (H1–H12)
  vulnerabilidad:
    "Vulnerabilidad agrupa los sistemas destinados a detectar necesidades humanas reales y conectar problemas con posibles soluciones.\n\nIncluye áreas como GO Observatory, personas sin hogar, hambre y otras situaciones de riesgo o exclusión.\n\nSu objetivo es mejorar la capacidad de observar, priorizar y coordinar ayuda de forma ética y protegida.",
  etica:
    "Ética 55 contiene los principios, límites y reglas que deben filtrar el funcionamiento del ecosistema GO/TESO.\n\nSu objetivo es proteger a las personas, especialmente a las más vulnerables, y asegurar privacidad, transparencia, seguridad y un propósito beneficioso.\n\nLa ética no es una explicación decorativa: forma parte del flujo técnico de decisión del sistema.",
  vecinos:
    "Vecinos crea una red de comunicación y cooperación entre personas de una misma zona o comunidad.\n\nPermite compartir avisos, necesidades, favores, servicios e información local.\n\nSu objetivo es fortalecer la colaboración cercana y facilitar soluciones entre personas que viven próximas.",
  alertas:
    "Alertas ciudadanas permite comunicar incidencias, riesgos o necesidades relevantes dentro de una comunidad.\n\nSu objetivo es mejorar la información disponible y facilitar una respuesta coordinada cuando existe un posible problema.\n\nEn el futuro podrá relacionarse con prioridades y niveles de urgencia definidos por las tablas 11–99.",
  conflictos:
    "Lugares conflictivos permitirá identificar zonas donde se repiten incidencias, riesgos o conflictos.\n\nSu objetivo es organizar información territorial que ayude a comprender patrones y mejorar la prevención.\n\nNo debe etiquetar ni juzgar automáticamente a personas; debe centrarse en situaciones, contexto y posibles soluciones.",
  mayores:
    "Ayuda personas mayores agrupa servicios de apoyo, acompañamiento, comunicación y coordinación para personas de edad avanzada.\n\nSu objetivo es reducir aislamiento, facilitar tareas y conectar a la persona con familiares, vecinos, profesionales o servicios cuando sea necesario.",
  children:
    "Uber Children plantea un sistema coordinado de transporte seguro para menores.\n\nSu objetivo es conectar responsables autorizados, rutas, horarios, ubicaciones y confirmaciones para aumentar la seguridad y la trazabilidad.\n\nEste módulo necesitará protocolos específicos de identidad, permisos y protección infantil.",
  ayudaVec:
    "Ayuda vecinal permite solicitar u ofrecer apoyo concreto dentro de una comunidad.\n\nPuede incluir pequeñas tareas, acompañamiento, recogidas, desplazamientos o asistencia puntual.\n\nSu objetivo es convertir la voluntad de ayudar en acciones locales organizadas.",
  objetosPerd:
    "Objetos perdidos permite registrar, localizar y devolver objetos mediante información, ubicación y coordinación comunitaria.\n\nSu objetivo es facilitar que quien encuentra un objeto pueda conectarlo de forma segura con su propietario.",
  transpComp:
    "Transporte compartido conecta personas que realizan trayectos compatibles.\n\nSu objetivo es aprovechar desplazamientos existentes, reducir vehículos vacíos, costes, tráfico y emisiones.\n\nDebe funcionar con reglas de seguridad, identidad, consentimiento y valoración de compatibilidad.",
  compartirH:
    "Compartir es un motor transversal que permite ofrecer o utilizar objetos, recursos, espacios, tiempo o servicios.\n\nSu objetivo es reducir desperdicio y facilitar que un recurso disponible pueda ayudar a otra persona o comunidad.",
  tengoQuieroH:
    "Tengo / Quiero conecta lo que una persona tiene disponible con lo que otra persona necesita.\n\nPuede utilizarse para intercambio, préstamo, donación, compra, colaboración o búsqueda de soluciones.\n\nSu objetivo es transformar necesidades y recursos dispersos en conexiones útiles.",

  // GO SOCIAL (S1–S12)
  comida:
    "Comida conecta al usuario con restaurantes, proveedores y servicios de alimentación.\n\nPermite iniciar acciones, pedidos, reservas o navegación hacia diferentes opciones.\n\nSu objetivo es simplificar una necesidad cotidiana y conectarla con el resto del ecosistema GO.",
  cafe:
    "Café conecta al usuario con cafeterías, bares y espacios relacionados.\n\nPuede utilizarse para encontrar lugares, reservar, organizar encuentros o acceder a servicios.\n\nSu objetivo es facilitar actividades sociales y cotidianas de forma rápida.",
  viajes:
    "Viajes agrupa planificación, reservas, transporte, alojamiento y experiencias.\n\nSu objetivo es coordinar diferentes elementos de un viaje dentro de un mismo flujo de acción.\n\nPuede conectarse con calendario, rutas, pagos, reservas y Marketplace.",
  fiesta:
    "Fiesta permite organizar o descubrir celebraciones, ocio y actividades sociales.\n\nPuede conectar personas, lugares, horarios, entradas, transporte y servicios.\n\nSu objetivo es facilitar la coordinación completa de una actividad de ocio.",
  deportes:
    "Deportes conecta instalaciones, actividades, grupos, horarios y reservas deportivas.\n\nSu objetivo es facilitar la práctica de ejercicio y aumentar el acceso a actividades saludables.\n\nPuede relacionarse con recomendaciones, calendarios, grupos y prevención.",
  marketplace:
    "Marketplace conecta usuarios con empresas, proveedores, productos y servicios mediante diferentes órbitas y niveles de profundidad.\n\nSu objetivo es facilitar compras y contrataciones, además de generar una de las principales vías de sostenibilidad económica de GO.\n\nEl Marketplace aumenta su valor a medida que crecen los usuarios y la actividad del ecosistema.",
  actividades:
    "Actividades permite descubrir, crear y organizar opciones de ocio, cultura, aprendizaje y participación social.\n\nSu objetivo es ayudar a las personas a encontrar acciones adecuadas a sus intereses, disponibilidad y contexto.",
  eventos:
    "Eventos conecta al usuario con acontecimientos, entradas, horarios, ubicaciones y participantes.\n\nSu objetivo es facilitar el descubrimiento, la organización y la asistencia a eventos.\n\nPuede relacionarse con calendarios, rutas, grupos y reservas.",
  compras:
    "Compras conecta a las personas con tiendas, productos y comercios locales o externos.\n\nSu objetivo es simplificar la búsqueda y adquisición de productos desde GO.\n\nPuede integrarse con Marketplace, rutas, promociones, zonas y comisiones.",
  otro:
    "Otro es una categoría abierta que evita limitar las acciones del usuario a las categorías previamente creadas.\n\nPermite iniciar necesidades, actividades o acciones que todavía no tienen una órbita específica.\n\nSu objetivo es mantener el sistema abierto y ampliable.",
  compartirS:
    "Compartir permite ofrecer o utilizar recursos, objetos, espacios o servicios entre particulares.\n\nSu objetivo es facilitar colaboración, reutilización y aprovechamiento de recursos existentes.",
  tengoQuieroS:
    "Tengo / Quiero conecta ofertas y necesidades entre particulares.\n\nPermite expresar de forma sencilla qué se tiene disponible o qué se está buscando.\n\nSu objetivo es generar intercambios y soluciones dentro de la comunidad.",

  // GO COMUNICACIÓN (C1–C9)
  chat:
    "Chat permite mensajería directa e instantánea entre personas, grupos, empresas y servicios.\n\nSu objetivo es convertir conversaciones en coordinación y, cuando corresponda, relacionarlas con acciones, calendarios, documentos o módulos.",
  contactos:
    "Contactos integra personas, empresas y relaciones relevantes dentro de GO.\n\nSu objetivo es permitir que un contacto no sea solo un número, sino una puerta hacia comunicación, llamadas, reuniones, reservas y acciones compartidas.",
  notas:
    "Notas permite guardar información personal o compartida dentro del ecosistema.\n\nSu objetivo es conectar ideas, recordatorios y contenido con personas, calendarios, acciones o proyectos.",
  reuniones:
    "Reuniones coordina videollamadas, encuentros presenciales, participantes, horarios y documentación.\n\nSu objetivo es facilitar la preparación, ejecución y seguimiento de reuniones.",
  traduccion:
    "Traducción automática permitirá facilitar la comunicación entre personas que hablan diferentes idiomas.\n\nSu objetivo es reducir barreras lingüísticas en conversaciones, servicios, empresas y comunidades.",
  grupos:
    "Grupos permite organizar conversaciones, personas y acciones en espacios compartidos.\n\nSu objetivo es facilitar la coordinación de familias, equipos, comunidades, empresas o proyectos.",
  multinivel:
    "Multinivel organiza la comunicación en diferentes capas, responsabilidades o niveles jerárquicos.\n\nSu objetivo es permitir que la información llegue a quien corresponde sin generar ruido innecesario para todo el sistema.",
  enviosMas:
    "Envíos masivos permite distribuir mensajes, avisos o notificaciones a múltiples destinatarios.\n\nSu objetivo es mejorar la comunicación organizada de empresas, comunidades, servicios o emergencias.\n\nDebe incluir controles para evitar abuso, saturación y comunicaciones no autorizadas.",
  iaConv:
    "IA conversacional integra asistencia inteligente dentro de la comunicación de GO.\n\nSu objetivo es ayudar a comprender mensajes, organizar información, sugerir acciones y conectar conversaciones con otros módulos.",

  // GO EMPRESA (E1–E11)
  servicios:
    "GO Servicios agrupa herramientas para negocios y profesionales que ofrecen servicios a personas.\n\nIncluye sectores como peluquerías, restaurantes, hoteles, clínicas, gimnasios y otros.\n\nSu objetivo es proporcionar una base modular adaptable a cada actividad.",
  industry:
    "GO Industry agrupa procesos de producción, mantenimiento, logística interna, operaciones y control industrial.\n\nSu objetivo es detectar pérdidas, mejorar coordinación y adaptar GO a diferentes entornos productivos.",
  reservasEmp:
    "Reservas empresa permite que negocios y profesionales publiquen disponibilidad y reciban reservas.\n\nSu objetivo es atraer usuarios, generar actividad económica y coordinar calendarios entre clientes, empresas y profesionales.\n\nAdemás de monetización, produce contexto útil sobre acciones futuras, siempre protegido por el sistema ético.",
  rutasEmp:
    "Rutas empresa permite organizar desplazamientos, repartos, visitas y servicios empresariales.\n\nSu objetivo es reducir tiempos, kilómetros, duplicidades y costes de coordinación.",
  crm:
    "CRM organiza clientes, relaciones, oportunidades y comunicaciones empresariales.\n\nSu objetivo es centralizar el historial de relación con cada cliente y conectarlo con acciones, reservas y servicios.",
  docEmp:
    "Documentación permite organizar archivos, formularios, contratos, informes y registros empresariales.\n\nSu objetivo es conectar la información documental con procesos, personas, tareas y módulos.",
  b2b:
    "Marketplace B2B conecta empresas que necesitan comprar, vender, contratar o colaborar con otras empresas.\n\nSu objetivo es facilitar operaciones comerciales y encontrar recursos o proveedores adecuados.",
  comprasEmp:
    "Compras empresa ayuda a organizar adquisiciones, proveedores, necesidades y costes corporativos.\n\nSu objetivo es mejorar la planificación y reducir compras descoordinadas o ineficientes.",
  compartirE:
    "Compartir es el motor transversal de toda la plataforma GO para ofrecer o solicitar recursos entre organizaciones.\n\nPermite colaborar utilizando vehículos, espacios, maquinaria, personal, infraestructuras, materias primas, almacenes, transporte y capacidad productiva.\n\nSu objetivo es reducir recursos infrautilizados y conectar capacidad disponible con necesidades reales dentro del ecosistema.\n\nLo que cambia entre usuarios son únicamente los permisos, las categorías visibles y los filtros de acceso; el motor es siempre el mismo.",
  tengoQuieroE:
    "Tengo / Quiero permite que una empresa publique lo que tiene disponible o lo que necesita.\n\nSu objetivo es facilitar intercambio, compra, alquiler, colaboración y reutilización de recursos empresariales.",

  // GO LOGÍSTICA (L1–L13)
  transpPersonas:
    "Transporte personas organiza movilidad, horarios, rutas y servicios para pasajeros.\n\nSu objetivo es coordinar desplazamientos de forma segura, eficiente y adaptada a cada necesidad.",
  transpMercancias:
    "Transporte mercancías coordina envíos, recogidas, repartos y movimiento de productos.\n\nSu objetivo es mejorar visibilidad, planificación y aprovechamiento de rutas y vehículos.",
  ultimaMilla:
    "Última milla gestiona la fase final de entrega al destinatario.\n\nSu objetivo es reducir entregas fallidas, desplazamientos repetidos, esperas y costes de la fase más compleja del reparto.",
  rutasInt:
    "Rutas inteligentes optimiza recorridos utilizando información de destinos, tiempos, prioridades y recursos.\n\nSu objetivo es encontrar combinaciones más eficientes y adaptarse a cambios durante la operación.",
  agendaRutas:
    "Agenda y rutas conecta horarios, tareas, visitas y desplazamientos.\n\nSu objetivo es construir jornadas realistas teniendo en cuenta duración, ubicación y tiempo de viaje.",
  zonasTarifas:
    "Zonas y tarifas organiza áreas de cobertura, reglas económicas y multiplicadores territoriales.\n\nSu objetivo es adaptar precios y operaciones a las condiciones específicas de cada zona.",
  compartirRutas:
    "Compartir rutas permite combinar trayectos compatibles entre personas o empresas.\n\nSu objetivo es aprovechar kilómetros que ya van a recorrerse y reducir viajes vacíos o duplicados.",
  flotas:
    "Flotas organiza vehículos, disponibilidad, mantenimiento, utilización y asignaciones.\n\nSu objetivo es mejorar el uso de cada vehículo y reducir inactividad o sobrecarga.",
  almacenes:
    "Almacenes coordina ubicaciones, stock, entradas, salidas y movimientos internos.\n\nSu objetivo es mejorar trazabilidad y reducir pérdidas, errores y tiempos de búsqueda.",
  gps:
    "Seguimiento GPS proporciona trazabilidad autorizada y en tiempo real de rutas, vehículos o entregas.\n\nSu objetivo es mejorar coordinación, seguridad y capacidad de respuesta ante incidencias.",
  optIA:
    "Optimización IA utilizará inteligencia artificial para analizar operaciones logísticas y proponer mejoras.\n\nSu objetivo es anticipar problemas, comparar alternativas y reducir tiempos, costes y recursos desperdiciados.",
  transpCompL:
    "Transporte compartido conecta trayectos compatibles para personas, empresas o mercancías.\n\nSu objetivo es aprovechar capacidad disponible y disminuir desplazamientos innecesarios.",
  uberChildrenL:
    "Uber Children conexión enlaza el módulo logístico con el transporte seguro de menores.\n\nSu objetivo es aplicar rutas, horarios, seguimiento y coordinación bajo protocolos específicos de protección infantil.",

  // GO IA (AI1–AI9)
  interpretacion:
    "Interpretación analiza información, contexto y relaciones entre módulos.\n\nSu objetivo es transformar datos dispersos en una comprensión estructurada que pueda utilizarse dentro de los límites autorizados.",
  automatizacion:
    "Automatizaciones permite ejecutar flujos y acciones repetitivas de forma coordinada.\n\nSu objetivo es reducir trabajo manual y conectar diferentes módulos sin perder control ni trazabilidad.",
  sugerencias:
    "Sugerencias ofrece recomendaciones adaptadas al contexto permitido de cada persona o situación.\n\nSu objetivo es ayudar en el momento adecuado sin sustituir la decisión humana.",
  prediccion:
    "Predicción compara estados, patrones y posibles consecuencias futuras.\n\nSu objetivo es anticipar necesidades o riesgos y valorar cuánto podría mejorar o empeorar cada alternativa.\n\nNo debe presentarse como certeza, sino como estimación que debe volver a medirse.",
  asistente:
    "Ayudante personal integra asistencia de inteligencia artificial en el uso diario de GO.\n\nSu objetivo es ayudar a organizar, recordar, coordinar y conectar necesidades con acciones.",
  iaEmpresarial:
    "IA empresarial aplica sistemas de análisis y automatización a procesos de empresas y organizaciones.\n\nSu objetivo es detectar ineficiencias, apoyar decisiones y mejorar operaciones.",
  iaEtica:
    "IA ética supervisa que los modelos y acciones de inteligencia artificial respeten las reglas, límites y finalidad del ecosistema.\n\nSu objetivo es reducir usos inadecuados y asegurar que cada intervención esté autorizada y justificada.",
  iaLogistica:
    "IA logística analiza rutas, cargas, tiempos, recursos y operaciones de transporte.\n\nSu objetivo es proponer alternativas que mejoren la eficiencia logística.",
  iaReservas:
    "IA de reservas ayuda a coordinar disponibilidad, preferencias, horarios y posibles profesionales o servicios.\n\nSu objetivo es simplificar el proceso de reserva y mejorar la asignación de opciones relevantes.",

  // GO NEGOCIO (B1–B9)
  suscripciones:
    "Suscripciones organiza planes de acceso y servicios recurrentes.\n\nSu objetivo es permitir diferentes niveles de utilización y crear ingresos estables para sostener el ecosistema.",
  facturacion:
    "Facturación gestiona emisión, recepción y organización de facturas e ingresos.\n\nSu objetivo es conectar la actividad económica con empresas, módulos y servicios de forma trazable.",
  pagos:
    "Pagos integra pasarelas y métodos de cobro para transacciones del ecosistema.\n\nSu objetivo es facilitar pagos seguros entre usuarios, empresas, profesionales y módulos.",
  modContratados:
    "Módulos contratados permite controlar qué herramientas tiene activadas cada empresa o cliente.\n\nSu objetivo es ofrecer una estructura modular en la que cada organización pague y utilice solo lo que necesita.",
  comisiones:
    "Comisiones calcula y distribuye ingresos generados por ventas, reservas, partners, rutas, zonas u otras actividades.\n\nSu objetivo es automatizar modelos económicos complejos con transparencia y trazabilidad.",
  licencias:
    "Licencias organiza derechos de uso, condiciones, territorios y duración de acceso a módulos o tecnología.\n\nSu objetivo es permitir diferentes modelos de implantación y expansión.",
  inversionMod:
    "Inversión por módulos permite vincular financiación con partes concretas del ecosistema.\n\nSu objetivo es facilitar que diferentes módulos puedan desarrollarse con presupuestos, equipos y objetivos independientes.",
  participaciones:
    "Participaciones por zona organiza inversión, rendimiento o colaboración económica vinculada a territorios específicos.\n\nSu objetivo es permitir modelos de expansión adaptados a países, regiones o ciudades.",
  costes:
    "Costes por módulo registra y estima desarrollo, mantenimiento, infraestructura y operación de cada parte de GO.\n\nSu objetivo es mejorar planificación, presupuestos y decisiones de inversión.",
};

// Padres de nivel 2 cuyos propios hijos (nivel 3) también reciben botón "i":
// GO Servicios, GO Industry, Ética 55, Vulnerabilidad y GO PRL — extensión puntual solicitada.
const LEVEL3_INFO_PARENT_KEYS = ["servicios", "industry", "etica", "vulnerabilidad", "prl"];

// Textos de los módulos de nivel 3 dentro de GO Servicios, GO Industry y Ética 55.
const LEVEL3_INFO_ES: Record<string, string> = {
  // ── GO EMPRESA > GO Industry ──────────────────────────────────────────
  produccion:
    "Producción organiza las líneas de trabajo, los procesos productivos y las diferentes fases necesarias para fabricar un producto o prestar una actividad industrial.\n\nSu objetivo es conocer qué se está produciendo, en qué estado se encuentra cada proceso y dónde pueden existir pérdidas de tiempo, recursos o capacidad.\n\nEsta información podrá conectarse con mantenimiento, sensores, alarmas, logística interna y otros módulos industriales.",
  mantenimiento:
    "Mantenimiento organiza las revisiones, reparaciones, incidencias y necesidades técnicas de instalaciones, vehículos y maquinaria.\n\nSu objetivo es reducir averías, paradas inesperadas y costes derivados de una planificación insuficiente.\n\nEn el futuro podrá relacionarse con sensores, historial de fallos, piezas disponibles y mantenimiento predictivo.",
  logInterna:
    "Logística interna coordina el movimiento de materiales, productos, herramientas y recursos dentro de una instalación industrial.\n\nSu objetivo es reducir esperas, recorridos innecesarios, cuellos de botella y falta de materiales en los puntos de trabajo.\n\nPuede conectarse con producción, almacenes, rutas internas, tareas y capacidad operativa.",
  sensores:
    "Sensores agrupa la información obtenida desde dispositivos que miden el estado de máquinas, instalaciones, procesos o condiciones ambientales.\n\nSu objetivo es convertir señales físicas en información útil para detectar cambios, incidencias y oportunidades de mejora.\n\nLa información deberá utilizarse dentro de los permisos, límites y protocolos definidos por el sistema.",
  alarmas:
    "Alarmas organiza avisos relacionados con fallos, riesgos, desviaciones o situaciones que requieren atención.\n\nSu objetivo es que cada alerta llegue a las personas adecuadas con una prioridad y un contexto comprensibles.\n\nEn el futuro podrá utilizar niveles, urgencias y prioridades relacionados con las tablas 11–99, pero esa lógica todavía no debe implementarse.",
  kpis:
    "KPIs reúne los indicadores principales utilizados para medir el funcionamiento de la actividad industrial.\n\nPuede incluir producción, tiempos, costes, calidad, incidencias, capacidad, mantenimiento y otros resultados relevantes.\n\nSu objetivo es mostrar cómo evoluciona la operación y facilitar decisiones basadas en información real.",
  planos:
    "Planos industriales organiza planos de instalaciones, maquinaria, zonas, rutas, elementos de seguridad y distribución de espacios.\n\nSu objetivo es conectar la representación física de la empresa con tareas, incidencias, mantenimiento, emergencias y otros módulos.\n\nEsto permite entender con mayor claridad dónde sucede cada acción dentro de la instalación.",
  averias:
    "Fallos predictivos plantea el análisis de señales y patrones que podrían anticipar una posible avería o pérdida de rendimiento.\n\nSu objetivo es ayudar a actuar antes de que el problema provoque una parada, un accidente o un coste mayor.\n\nLas predicciones serán estimaciones y deberán comprobarse mediante nuevas mediciones; no deben tratarse como certezas automáticas.",
  materias:
    "Materias primas organiza existencias, necesidades, consumo y disponibilidad de los materiales utilizados durante la producción.\n\nSu objetivo es reducir faltas de suministro, exceso de inventario, desperdicio y compras mal coordinadas.\n\nPuede conectarse con producción, almacenes, proveedores, compras y planificación.",
  capacidad:
    "Capacidad de producción analiza cuánto puede producir realmente una instalación durante un periodo determinado.\n\nTiene en cuenta recursos, personal, maquinaria, tiempos, mantenimiento y posibles limitaciones.\n\nSu objetivo es ayudar a planificar cargas de trabajo realistas y detectar capacidad desaprovechada o sobrecarga.",
  compartirI:
    "Compartir es un motor transversal que permite que empresas o áreas industriales ofrezcan recursos que no están utilizando completamente.\n\nPuede incluir maquinaria, vehículos, espacios, materiales, herramientas, personal o capacidad productiva.\n\nSu objetivo es conectar recursos disponibles con necesidades reales y reducir infrautilización y costes.",
  tengoQuieroI:
    "Tengo / Quiero permite que una empresa indique qué recursos tiene disponibles y cuáles necesita.\n\nPuede utilizarse para intercambio, compra, alquiler, cesión, colaboración o búsqueda de proveedores.\n\nSu objetivo es transformar capacidad y necesidades dispersas en oportunidades de cooperación industrial.",

  // ── GO EMPRESA > GO Servicios ─────────────────────────────────────────
  peluquerias:
    "Peluquerías adapta las herramientas de GO Servicios a negocios de peluquería, belleza y cuidado personal.\n\nPermite organizar profesionales, tratamientos, horarios, disponibilidad y reservas.\n\nSu objetivo es facilitar la gestión del negocio y simplificar al cliente la búsqueda y reserva del servicio que necesita.",
  restaurantes:
    "Restaurantes organiza reservas, disponibilidad, horarios, mesas, servicios y atención al cliente.\n\nSu objetivo es mejorar la coordinación entre el establecimiento y las personas que desean reservar o utilizar sus servicios.\n\nPuede conectarse con Marketplace, calendarios, grupos, eventos, rutas y pagos.",
  hoteles:
    "Hoteles plantea herramientas para gestionar disponibilidad, reservas, servicios, habitaciones y atención al huésped.\n\nSu objetivo es conectar alojamiento, calendario, servicios adicionales, experiencias y desplazamientos dentro de un mismo flujo.\n\nPodrá adaptarse a hoteles, alojamientos independientes y otras modalidades.",
  clinicas:
    "Clínicas organiza citas, profesionales, horarios, servicios y atención administrativa.\n\nSu objetivo es simplificar la coordinación entre la persona y el centro, respetando siempre la privacidad y la sensibilidad de la información.\n\nCualquier futura función sanitaria deberá contar con protocolos, permisos y límites específicos.",
  gimnasios:
    "Gimnasios organiza reservas de instalaciones, clases, actividades, entrenadores y horarios.\n\nSu objetivo es facilitar el acceso al ejercicio y mejorar la coordinación entre usuarios, profesionales y centros deportivos.\n\nPuede conectarse con calendarios, grupos, recomendaciones y otros módulos de bienestar.",
  autonomos:
    "Profesionales autónomos permite que trabajadores independientes publiquen sus servicios, disponibilidad y zonas de trabajo.\n\nSu objetivo es ofrecer una estructura sencilla para recibir clientes, organizar reservas y coordinar su actividad.\n\nPuede adaptarse a múltiples profesiones sin necesitar una aplicación diferente para cada sector.",
  domicilio:
    "Servicios a domicilio organiza profesionales y empresas que se desplazan hasta la ubicación del cliente.\n\nPuede incluir reparaciones, limpieza, cuidados, mantenimiento, asistencia y otros servicios.\n\nSu objetivo es coordinar disponibilidad, ubicación, ruta, duración, precio y confirmación del servicio.",
  svcEmpresas:
    "Servicios empresariales conecta empresas con profesionales o proveedores especializados en necesidades B2B.\n\nPuede incluir asesoría, mantenimiento, formación, documentación, tecnología y otros servicios profesionales.\n\nSu objetivo es facilitar que cada empresa encuentre y coordine la ayuda especializada que necesita.",
  reservasSvc:
    "Reservas de servicios es el motor integrado que conecta clientes, empresas, profesionales, calendarios y disponibilidad.\n\nSu objetivo es facilitar reservas reales, atraer usuarios recurrentes y generar actividad económica dentro del ecosistema.\n\nAdemás del valor económico, las reservas generan contexto autorizado sobre acciones futuras que puede ayudar a coordinar mejor otros módulos.",
  prl:
    "GO PRL agrupa los módulos destinados a la prevención de riesgos laborales y a la mejora de la seguridad en empresas y centros de trabajo.\n\nIncluye áreas como extintores, equipos de protección, auditorías, formación, planificación y otros controles preventivos.\n\nSu objetivo es ayudar a detectar riesgos, coordinar obligaciones y reducir accidentes mediante información y acciones organizadas.",

  // ── GO EMPRESA > GO Servicios > GO PRL ────────────────────────────────
  extintores:
    "GO Extintores organiza la ubicación, revisión, mantenimiento y control de todos los extintores de una empresa.\n\nSu objetivo es garantizar que cada extintor esté operativo, correctamente señalizado y disponible cuando sea necesario.\n\nPuede conectarse con revisiones, planos industriales, auditorías, alarmas y documentación PRL.",
  epi:
    "GO EPI organiza la entrega, control y seguimiento de los equipos de protección individual utilizados por cada trabajador.\n\nSu objetivo es garantizar que cada persona disponga del equipo adecuado según su puesto y que su utilización pueda verificarse.\n\nPuede relacionarse con formación, documentación PRL, auditorías y revisiones.",
  auditorias:
    "GO Auditorías organiza inspecciones internas y externas para comprobar el cumplimiento de la normativa preventiva.\n\nSu objetivo es detectar desviaciones, mejorar procesos y facilitar el seguimiento de acciones correctivas.\n\nPuede conectarse con documentación PRL, revisiones, señalización y formación.",
  senializacion:
    "GO Señalización organiza toda la señalización de seguridad presente en instalaciones, zonas de trabajo y recorridos.\n\nSu objetivo es garantizar que la información preventiva sea visible, correcta y actualizada.\n\nPuede relacionarse con planos industriales, salidas de emergencia, auditorías y revisiones.",
  salidas:
    "GO Salidas de emergencia organiza las vías de evacuación, puertas de emergencia y recorridos de salida de una instalación.\n\nSu objetivo es garantizar evacuaciones rápidas y seguras en caso de incidente.\n\nPuede conectarse con planos industriales, planes de evacuación, señalización y auditorías.",
  planesEvac:
    "GO Planes de evacuación organiza los protocolos, recorridos y simulacros de evacuación de una empresa.\n\nSu objetivo es preparar a trabajadores y responsables para actuar correctamente ante una emergencia.\n\nPuede relacionarse con formación, salidas de emergencia, planos industriales y alarmas.",
  formacion:
    "GO Formación organiza cursos, certificados, reciclajes y acciones formativas relacionadas con la prevención de riesgos laborales.\n\nSu objetivo es mantener actualizados los conocimientos de trabajadores y responsables en materia preventiva.\n\nPuede conectarse con EPI, auditorías, documentación PRL y empresas cliente PRL.",
  revisiones:
    "GO Revisiones organiza las inspecciones periódicas obligatorias y los controles preventivos de instalaciones y equipos.\n\nSu objetivo es asegurar que todas las revisiones se realizan en plazo y quedan correctamente registradas.\n\nPuede relacionarse con extintores, señalización, auditorías y documentación PRL.",
  docPRL:
    "GO Documentación PRL organiza certificados, informes, registros, evaluaciones y toda la documentación preventiva de la empresa.\n\nSu objetivo es centralizar la información para facilitar consultas, inspecciones y cumplimiento normativo.\n\nPuede conectarse con auditorías, formación, revisiones y empresas cliente PRL.",
  clientesPRL:
    "GO Empresas cliente PRL organiza la cartera de empresas gestionadas por un servicio de prevención o consultora especializada.\n\nSu objetivo es centralizar la información preventiva de cada cliente y facilitar el seguimiento de sus obligaciones.\n\nPuede relacionarse con todos los módulos de GO PRL, permitiendo gestionar cada empresa desde una única plataforma.",

  // ── GO HUMANITY > Ética ❤️👽55👽❤️ ───────────────────────────────────
  principiosGO:
    "Principios GO reúne las bases éticas que orientan todo el ecosistema.\n\nDefine qué propósito debe perseguir la tecnología, qué límites no deben sobrepasarse y qué valores deben mantenerse durante su evolución.\n\nSu objetivo es que todas las decisiones técnicas y económicas estén subordinadas a la protección y al beneficio humano.",
  protVuln:
    "Protección de personas vulnerables establece reglas especiales para situaciones en las que una persona puede sufrir un riesgo, una desventaja o una capacidad reducida para defender sus intereses.\n\nSu objetivo es aumentar la protección, reducir posibles abusos y exigir controles más estrictos cuanto mayor sea la vulnerabilidad.",
  transparencia:
    "Transparencia busca que las personas puedan comprender qué información se utiliza, con qué finalidad y qué efecto puede producir una acción del sistema.\n\nSu objetivo es evitar procesos ocultos o incomprensibles y facilitar explicaciones claras sobre datos, decisiones y resultados.",
  usoIA:
    "Uso responsable de la IA define límites y criterios para que la inteligencia artificial actúe de forma segura, proporcional y orientada a ayudar.\n\nSu objetivo es impedir usos dañinos, invasivos, coercitivos o alejados del propósito humano del ecosistema.\n\nLa IA debe operar con diferentes niveles de autonomía según el riesgo, el impacto y la reversibilidad de cada acción.",
  derechos:
    "Derechos y deberes organiza los derechos que deben conservar usuarios, empresas, profesionales y comunidades, junto con las responsabilidades asociadas al uso del sistema.\n\nSu objetivo es mantener un equilibrio entre libertad, protección, colaboración y responsabilidad.",
  bienestar:
    "Bienestar colectivo analiza cómo una acción puede afectar no solo a una persona, sino también a grupos, comunidades y sociedad.\n\nSu objetivo es buscar soluciones que generen un resultado positivo amplio sin ignorar los derechos individuales.\n\nNo significa que el bienestar colectivo permita perjudicar injustamente a una persona.",
  seguridad:
    "Seguridad reúne los controles necesarios para proteger datos, identidad, acceso, privacidad y funcionamiento del ecosistema.\n\nSu objetivo es prevenir pérdida, manipulación, filtración o utilización no autorizada de la información.\n\nCuanto más sensible sea la información, mayores deberán ser sus niveles de protección.",
  indicadores:
    "Indicadores éticos permite medir de forma continua si un módulo, una decisión o una acción está cumpliendo los principios establecidos.\n\nSu objetivo es detectar desviaciones y comparar cuánto mejora o empeora el estado de las personas y del sistema.\n\nEn el futuro podrá conectarse con las tablas 11–99, pero esa lógica todavía no debe implementarse.",
  preguntasEticas:
    "Preguntas éticas por módulo establece una revisión específica para cada funcionalidad antes de desarrollarla, activarla o modificarla.\n\nPuede analizar quién se beneficia, quién podría resultar perjudicado, qué información se necesita, qué límites deben existir y qué consecuencias pueden aparecer.\n\nSu objetivo es evitar que una solución técnicamente posible se implemente sin comprender previamente su impacto humano.",
  consecuencias:
    "Consecuencias de las acciones registra y analiza qué efectos produce cada decisión después de ejecutarse.\n\nSu objetivo es comparar el resultado esperado con el resultado real, detectar efectos secundarios y volver a medir el sistema.\n\nTambién contempla que no intervenir puede ser una respuesta seleccionada y medida cuando los protocolos indican que es la opción adecuada.",

  // ── GO HUMANITY > Vulnerabilidad ──────────────────────────────────────
  observatory:
    "GO Observatory es la capa global de detección y observación del ecosistema.\n\nIdentifica necesidades, vulnerabilidades y situaciones de riesgo para que el resto de módulos puedan entender dónde puede hacer falta ayuda o intervención.\n\nSu objetivo es observar sin intervenir directamente, ofreciendo información útil y protegida al resto del sistema.",
  sinHogar:
    "Personas sin hogar identifica y coordina apoyo para personas sin una vivienda estable.\n\nAyuda a conectar las necesidades detectadas con la ayuda y los recursos disponibles.\n\nSu objetivo es mejorar la capacidad de respuesta ante situaciones de sinhogarismo de forma ética y protegida.",
  hambre:
    "Hambre identifica situaciones de inseguridad alimentaria y necesidades de alimentación.\n\nAyuda a coordinar los alimentos, recursos y ayudas disponibles con las personas o zonas que los necesitan.\n\nSu objetivo es reducir el hambre facilitando una conexión más rápida entre necesidad y recurso.",
  conflictos:
    "Lugares conflictivos ayuda a identificar y comprender zonas afectadas por conflictos o riesgos graves.\n\nFacilita la visibilidad, la coordinación y la respuesta humanitaria en esas situaciones.\n\nSu objetivo es dar contexto útil para actuar con mayor rapidez y seguridad.",
  mayoresSolos:
    "Personas mayores solas se centra en detectar y apoyar a personas mayores que viven sin compañía.\n\nPuede ayudar a coordinar acompañamiento, asistencia, seguimiento o ayuda cuando sea necesario.\n\nSu objetivo es reducir el aislamiento y mejorar la atención hacia este colectivo.",
  necesidades:
    "Necesidades urgentes identifica necesidades críticas e inmediatas que requieren atención rápida.\n\nPermite priorizar y coordinar una respuesta ágil ante estas situaciones.\n\nSu objetivo es reducir el tiempo entre la detección de una necesidad urgente y su atención.",
  recursos:
    "Recursos disponibles organiza y mapea los recursos sociales y humanitarios disponibles.\n\nPermite conectarlos con las necesidades detectadas en otros módulos.\n\nSu objetivo es aprovechar mejor los recursos existentes evitando que queden sin utilizar.",
  excedentes:
    "Excedentes identifica materiales, alimentos u otros recursos sobrantes que podrían reutilizarse en lugar de desperdiciarse.\n\nAyuda a redirigirlos hacia quien pueda necesitarlos.\n\nSu objetivo es reducir el desperdicio y aumentar el aprovechamiento de lo que ya existe.",
  donaciones:
    "Donaciones disponibles ayuda a organizar y coordinar donaciones económicas, materiales o de otro tipo.\n\nPermite conectarlas con las necesidades adecuadas de forma ordenada.\n\nSu objetivo es que cada donación llegue donde puede generar más beneficio.",
  alertas:
    "Alertas ciudadanas ofrece un sistema para detectar, comunicar y coordinar alertas relevantes de seguridad o vulnerabilidad en la comunidad.\n\nPermite que la información llegue a quien puede actuar sobre ella.\n\nSu objetivo es mejorar la respuesta comunitaria ante situaciones de riesgo.",
  oportunidades:
    "Oportunidades sociales identifica situaciones donde una intervención, colaboración o ayuda disponible podría mejorar un contexto concreto.\n\nAyuda a detectar dónde una acción puede generar un beneficio real.\n\nSu objetivo es convertir información protegida en oportunidades concretas de ayuda.",
  salud:
    "Salud observa indicadores de vulnerabilidad relacionados con la salud.\n\nAyuda a mejorar la visibilidad, la prevención y la coordinación de la asistencia sanitaria necesaria.\n\nSu objetivo es detectar necesidades de salud antes de que se agraven.",
  transporte:
    "Transporte identifica limitaciones de movilidad que pueden impedir el acceso a servicios esenciales, trabajo, sanidad o ayuda.\n\nAyuda a visibilizar estas barreras para poder coordinarlas mejor.\n\nSu objetivo es mejorar el acceso de las personas a lo que necesitan, sin importar su movilidad.",
  desempleo:
    "Desempleo observa la vulnerabilidad relacionada con la falta de empleo.\n\nAyuda a identificar zonas o grupos donde puede hacer falta apoyo y oportunidades laborales.\n\nSu objetivo es facilitar una respuesta más ágil ante situaciones de desempleo.",
  catastrofes:
    "Catástrofes identifica y organiza información relacionada con desastres naturales, emergencias y otros eventos de gran magnitud.\n\nAyuda a coordinar una respuesta más rápida y ordenada.\n\nSu objetivo es mejorar la capacidad de reacción ante situaciones excepcionales.",
  eticos:
    "Indicadores éticos observa métricas relacionadas con la equidad, la justicia social, el bienestar y el impacto humano de las situaciones y las acciones.\n\nAyuda a comprobar si el sistema está cumpliendo sus principios.\n\nSu objetivo es mantener siempre una orientación ética en las decisiones del ecosistema.",
  medioamb:
    "Indicadores medioambientales observa condiciones e impactos ambientales que pueden generar o aumentar la vulnerabilidad humana.\n\nAyuda a anticipar problemas relacionados con el entorno.\n\nSu objetivo es conectar la información ambiental con la protección de las personas.",
  iaPredict:
    "IA predictiva es una capa futura que utilizará datos y patrones disponibles para ayudar a anticipar posibles necesidades o situaciones de vulnerabilidad.\n\nSiempre estará sujeta a los principios éticos de GO y a la supervisión humana.\n\nSu objetivo es anticipar sin sustituir nunca la decisión humana.",
  mapaMundial:
    "Mapa mundial ofrece la vista global unificada de la información de vulnerabilidad, necesidades, recursos e indicadores relevantes del ecosistema.\n\nPermite comprender de un vistazo el estado general de las situaciones detectadas.\n\nSu objetivo es centralizar toda la información de Vulnerabilidad en una única vista clara.",
};

// Búsqueda combinada: bloque madre (nivel 1), módulo interno (nivel 2) o
// submódulo de nivel 3 dentro de GO Servicios / GO Industry / Ética 55.
function getInfoES(key: string): string | undefined {
  return ROOT_INFO_ES[key] ?? MODULE_INFO_ES[key] ?? LEVEL3_INFO_ES[key];
}
function getInfoEN(key: string): string | undefined {
  return ROOT_INFO_EN[key] ?? MODULE_INFO_EN[key] ?? LEVEL3_INFO_EN[key];
}

// Returns the best available info text for the current language.
// Both languages use the same depth of content — full multi-paragraph
// descriptions. EN falls back to ES only when no EN translation exists yet,
// so the modal is never empty.
function getInfo(key: string, lang: string, node: RoadmapNode): string {
  if (lang === 'en') {
    return getInfoEN(key) ?? getInfoES(key) ?? node.desc;
  }
  return getInfoES(key) ?? node.desc;
}

// ─── Botón de información ("i") — solo bloques madre ─────────────────────────
function RootInfoButton({ color, onPress }: { color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      activeOpacity={0.75}
      style={[s.rootInfoBtn, { borderColor: color + "60", backgroundColor: color + "1A" }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[s.rootInfoBtnTxt, { color }]}>i</Text>
    </TouchableOpacity>
  );
}

// ─── Modal informativo de bloque madre ───────────────────────────────────────
function RootInfoModal({ node, onClose, lang }: { node: RoadmapNode | null; onClose: () => void; lang: string }) {
  if (!node) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.rootInfoOverlay}>
        <View style={[s.rootInfoCard, { borderColor: node.color + "40" }]}>
          <View style={s.rootInfoHeader}>
            <Text style={s.rootInfoEmoji}>{node.emoji}</Text>
            <Text style={[s.rootInfoTitle, { color: node.color }]}>{nodeLabel(node, lang)}</Text>
          </View>
          <ScrollView style={s.rootInfoScroll} showsVerticalScrollIndicator={false}>
            <Text style={s.rootInfoBody}>{getInfo(node.key, lang, node)}</Text>
          </ScrollView>
          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={[s.rootInfoCloseBtn, { backgroundColor: node.color }]}>
            <Text style={s.rootInfoCloseTxt}>{lang === 'en' ? "Close" : "Cerrar"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Helper: pick EN overlay or original ─────────────────────────────────────
function nodeLabel(node: RoadmapNode, lang: string): string {
  return lang === 'en' ? (ROADMAP_LABEL_EN[node.key] ?? node.label) : node.label;
}
function nodeDesc(node: RoadmapNode, lang: string): string {
  return lang === 'en' ? (ROADMAP_DESC_EN[node.key] ?? node.desc) : node.desc;
}

// ─── ÁRBOL COMPLETO ──────────────────────────────────────────────────────────
const ROADMAP_TREE: RoadmapNode[] = [
  /* ══════════════════════════════════════════════════════
     1. GO HUMANITY
  ══════════════════════════════════════════════════════ */
  {
    key: "humanity", emoji: "🟢", label: "GO HUMANITY", color: "#3D9A84", progress: 9,
    desc: "Calidad de vida, cooperación ciudadana y cohesión social.",
    children: [
      {
        key: "vulnerabilidad", emoji: "❤️", label: "Vulnerabilidad", color: "#e11d48", progress: 0,
        desc: "Ayuda a personas en situaciones difíciles y coordinación de recursos.",
        children: [
          {
            key: "observatory", emoji: "👁️", label: "GO Observatory", color: "#1d4ed8", progress: 0,
            desc: "Observatorio mundial de necesidades, riesgos y oportunidades. Detecta dónde hace falta actuar sin intervenir directamente.",
            children: [
              { key: "obs_sinHogar",   emoji: "🏚️", label: "Personas sin hogar",          color: "#1d4ed8", progress: 0, desc: "Detección de personas sin hogar en tiempo real." },
              { key: "obs_hambre",     emoji: "🍽️", label: "Hambre",                       color: "#1d4ed8", progress: 0, desc: "Zonas con inseguridad alimentaria detectada." },
              { key: "obs_conflictos", emoji: "⚠️", label: "Lugares conflictivos",         color: "#1d4ed8", progress: 0, desc: "Mapeo de zonas de riesgo y conflicto." },
              { key: "obs_mayores",    emoji: "👴", label: "Personas mayores solas",        color: "#1d4ed8", progress: 0, desc: "Indicadores de aislamiento en personas mayores." },
              { key: "obs_urgentes",   emoji: "🆘", label: "Necesidades urgentes",          color: "#1d4ed8", progress: 0, desc: "Canal de necesidades críticas detectadas." },
              { key: "obs_recursos",   emoji: "🔗", label: "Recursos disponibles",          color: "#1d4ed8", progress: 0, desc: "Mapa de recursos sociales disponibles." },
              { key: "obs_excedentes", emoji: "📦", label: "Excedentes",                   color: "#1d4ed8", progress: 0, desc: "Excedentes materiales y alimentarios localizados." },
              { key: "obs_donaciones", emoji: "🎁", label: "Donaciones disponibles",        color: "#1d4ed8", progress: 0, desc: "Donaciones activas pendientes de asignación." },
              { key: "obs_alertas",    emoji: "🔔", label: "Alertas ciudadanas",            color: "#1d4ed8", progress: 0, desc: "Alertas reportadas por la comunidad." },
              { key: "obs_oport",      emoji: "💡", label: "Oportunidades sociales",        color: "#1d4ed8", progress: 0, desc: "Oportunidades de intervención social detectadas." },
              { key: "obs_catastrofes",emoji: "🌪️", label: "Catástrofes",                  color: "#1d4ed8", progress: 0, desc: "Seguimiento de emergencias y catástrofes." },
              { key: "obs_salud",      emoji: "🏥", label: "Salud",                         color: "#1d4ed8", progress: 0, desc: "Indicadores de salud pública por zona." },
              { key: "obs_transporte", emoji: "🚌", label: "Transporte",                    color: "#1d4ed8", progress: 0, desc: "Carencias de movilidad y transporte." },
              { key: "obs_desempleo",  emoji: "📉", label: "Desempleo",                     color: "#1d4ed8", progress: 0, desc: "Tasas y focos de desempleo detectados." },
              { key: "obs_eticos",     emoji: "⚖️", label: "Indicadores éticos",            color: "#1d4ed8", progress: 0, desc: "Métricas de equidad y justicia social." },
              { key: "obs_medioamb",   emoji: "🌿", label: "Indicadores medioambientales",  color: "#1d4ed8", progress: 0, desc: "Impacto ambiental y sostenibilidad." },
              { key: "obs_ia",         emoji: "🤖", label: "IA predictiva",                 color: "#1d4ed8", progress: 0, desc: "Modelos predictivos de necesidades futuras." },
              { key: "obs_mapa",       emoji: "🌍", label: "Mapa mundial",                  color: "#1d4ed8", progress: 0, desc: "Vista global unificada del observatorio." },
            ],
          },
          { key: "sinHogar",     emoji: "🏚️", label: "Personas sin hogar",          color: "#e11d48", progress: 0, desc: "Localización y apoyo a personas sin hogar." },
          { key: "hambre",       emoji: "🍽️", label: "Hambre",                        color: "#e11d48", progress: 0, desc: "Zonas con inseguridad alimentaria y distribución de alimentos." },
          { key: "conflictos",   emoji: "⚠️", label: "Lugares conflictivos",          color: "#e11d48", progress: 0, desc: "Mapa colaborativo de zonas de riesgo y conflicto." },
          { key: "mayoresSolos", emoji: "👴", label: "Personas mayores solas",         color: "#e11d48", progress: 0, desc: "Apoyo y acompañamiento a mayores en situación de soledad." },
          { key: "necesidades",  emoji: "🆘", label: "Necesidades urgentes",           color: "#e11d48", progress: 0, desc: "Canal de necesidades críticas e inmediatas." },
          { key: "recursos",     emoji: "🔗", label: "Recursos disponibles",           color: "#e11d48", progress: 0, desc: "Mapa de recursos sociales disponibles para asignación." },
          { key: "excedentes",   emoji: "📦", label: "Excedentes",                    color: "#e11d48", progress: 0, desc: "Excedentes materiales y alimentarios listos para redistribuir." },
          { key: "donaciones",   emoji: "🎁", label: "Donaciones disponibles",         color: "#e11d48", progress: 0, desc: "Gestión de donaciones económicas y en especie." },
          { key: "alertas",      emoji: "🔔", label: "Alertas ciudadanas",             color: "#e11d48", progress: 0, desc: "Sistema de alertas reportadas por la comunidad." },
          { key: "oportunidades",emoji: "💡", label: "Oportunidades sociales",         color: "#e11d48", progress: 0, desc: "Oportunidades de intervención social detectadas por Observatory." },
          { key: "salud",        emoji: "🏥", label: "Salud",                          color: "#e11d48", progress: 0, desc: "Indicadores de salud pública y acceso a atención médica." },
          { key: "transporte",   emoji: "🚌", label: "Transporte",                     color: "#e11d48", progress: 0, desc: "Carencias de movilidad y acceso al transporte." },
          { key: "desempleo",    emoji: "📉", label: "Desempleo",                      color: "#e11d48", progress: 0, desc: "Tasas y focos de desempleo para intervención." },
          { key: "catastrofes",  emoji: "🌪️", label: "Catástrofes",                  color: "#e11d48", progress: 0, desc: "Emergencias, catástrofes naturales y respuesta humanitaria." },
          { key: "eticos",       emoji: "⚖️", label: "Indicadores éticos",            color: "#e11d48", progress: 0, desc: "Métricas de equidad, justicia social y bienestar." },
          { key: "medioamb",     emoji: "🌿", label: "Indicadores medioambientales",   color: "#e11d48", progress: 0, desc: "Impacto ambiental, contaminación y sostenibilidad." },
          { key: "iaPredict",    emoji: "🤖", label: "IA predictiva",                  color: "#e11d48", progress: 0, desc: "Modelos predictivos de necesidades futuras alimentados por Observatory." },
          { key: "mapaMundial",  emoji: "🌍", label: "Mapa mundial",                   color: "#e11d48", progress: 0, desc: "Vista global unificada — la pieza central de GO Observatory." },
        ],
      },
      {
        key: "etica", emoji: "👽", label: "Ética ❤️👽55👽❤️", color: "#6366f1", progress: 0,
        desc: "Reglas, principios y valores del ecosistema GO.",
        children: [
          { key: "principiosGO",   emoji: "📜", label: "Principios GO",                  color: "#6366f1", progress: 0, desc: "Fundamentos éticos que rigen todo GO." },
          { key: "protVuln",       emoji: "🛡️", label: "Protección personas vulnerables", color: "#6366f1", progress: 0, desc: "Protocolo especial para colectivos sensibles." },
          { key: "transparencia",  emoji: "🔍", label: "Transparencia",                   color: "#6366f1", progress: 0, desc: "Claridad en algoritmos, datos y decisiones." },
          { key: "usoIA",          emoji: "🤖", label: "Uso responsable IA",              color: "#6366f1", progress: 0, desc: "Límites y criterios éticos para la IA GO." },
          { key: "derechos",       emoji: "⚖️", label: "Derechos y deberes",              color: "#6366f1", progress: 0, desc: "Marco de derechos y obligaciones de usuarios." },
          { key: "bienestar",      emoji: "💚", label: "Bienestar colectivo",             color: "#6366f1", progress: 0, desc: "Impacto positivo en el tejido social." },
          { key: "seguridad",      emoji: "🔒", label: "Seguridad",                       color: "#6366f1", progress: 0, desc: "Protección de datos, privacidad y acceso." },
          { key: "indicadores",    emoji: "📊", label: "Indicadores éticos",              color: "#6366f1", progress: 0, desc: "KPIs de ética y seguimiento continuo." },
          { key: "preguntasEticas",emoji: "❓", label: "Preguntas éticas por módulo",     color: "#6366f1", progress: 0, desc: "Checklist ético para cada funcionalidad." },
          { key: "consecuencias",  emoji: "🔗", label: "Consecuencias de acciones",       color: "#6366f1", progress: 0, desc: "Trazabilidad de impactos de cada decisión." },
        ],
      },
      { key: "vecinos",     emoji: "🏘️", label: "Vecinos",               color: "#3D9A84", progress: 20, desc: "Red de vecinos y comunidad local." },
      { key: "alertas",     emoji: "🔔", label: "Alertas ciudadanas",    color: "#3D9A84", progress: 10, desc: "Sistema de alertas de seguridad ciudadana." },
      { key: "conflictos",  emoji: "⚠️", label: "Lugares conflictivos",  color: "#3D9A84", progress: 0,  desc: "Mapa colaborativo de zonas de riesgo." },
      { key: "mayores",     emoji: "👴", label: "Ayuda personas mayores", color: "#3D9A84", progress: 0,  desc: "Apoyo y acompañamiento a mayores." },
      { key: "children",    emoji: "🚸", label: "Uber Children",          color: "#3D9A84", progress: 0,  desc: "Transporte seguro de menores." },
      { key: "ayudaVec",   emoji: "🤲", label: "Ayuda vecinal",          color: "#3D9A84", progress: 5,  desc: "Apoyo entre vecinos del mismo barrio." },
      { key: "objetosPerd", emoji: "🔑", label: "Objetos perdidos",       color: "#3D9A84", progress: 0,  desc: "Sistema de objetos perdidos y encontrados." },
      { key: "transpComp",  emoji: "🚌", label: "Transporte compartido",  color: "#3D9A84", progress: 0,  desc: "Compartir trayectos con vecinos." },
      { key: "compartirH",  emoji: "🔄", label: "Compartir",              color: "#3D9A84", progress: 15, desc: "Motor transversal — compartir recursos." },
      { key: "tengoQuieroH",emoji: "🔁", label: "Tengo / Quiero",         color: "#3D9A84", progress: 15, desc: "Motor transversal — intercambio de necesidades." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     2. GO SOCIAL
  ══════════════════════════════════════════════════════ */
  {
    key: "social", emoji: "🟠", label: "GO SOCIAL", color: "#f97316", progress: 43,
    desc: "Actividades cotidianas y marketplace social.",
    children: [
      { key: "comida",      emoji: "🍔", label: "Comida",          color: "#f97316", progress: 80,  desc: "Pedir comida a domicilio." },
      { key: "cafe",        emoji: "☕", label: "Café",             color: "#f97316", progress: 70,  desc: "Reservar cafeterías y bares." },
      { key: "viajes",      emoji: "✈️", label: "Viajes",           color: "#f97316", progress: 20,  desc: "Planificación y reserva de viajes." },
      { key: "fiesta",      emoji: "🎉", label: "Fiesta",           color: "#f97316", progress: 10,  desc: "Organización de eventos y fiestas." },
      { key: "deportes",    emoji: "⚽", label: "Deportes",         color: "#f97316", progress: 30,  desc: "Instalaciones y actividades deportivas." },
      { key: "marketplace", emoji: "🛍️", label: "Marketplace",      color: "#f97316", progress: 60,  desc: "Compraventa entre particulares." },
      { key: "actividades", emoji: "🎭", label: "Actividades",      color: "#f97316", progress: 10,  desc: "Ocio y actividades culturales." },
      { key: "eventos",     emoji: "📅", label: "Eventos",          color: "#f97316", progress: 5,   desc: "Descubrir y asistir a eventos." },
      { key: "compras",     emoji: "🛒", label: "Compras",          color: "#f97316", progress: 20,  desc: "Compras en tiendas locales." },
      { key: "otro",        emoji: "➕", label: "Otro",             color: "#f97316", progress: 100, desc: "Categoría abierta." },
      { key: "compartirS",  emoji: "🔄", label: "Compartir",        color: "#f97316", progress: 15,  desc: "Motor transversal — compartir recursos." },
      { key: "tengoQuieroS",emoji: "🔁", label: "Tengo / Quiero",   color: "#f97316", progress: 15,  desc: "Motor transversal — intercambio de necesidades." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     3. GO COMUNICACIÓN
  ══════════════════════════════════════════════════════ */
  {
    key: "comunicacion", emoji: "🔵", label: "GO COMUNICACIÓN", color: "#4A80BD", progress: 39,
    desc: "Relación entre personas, empresas y grupos.",
    children: [
      { key: "chat",       emoji: "💬", label: "Chat",                 color: "#4A80BD", progress: 90, desc: "Mensajería directa e instantánea." },
      { key: "contactos",  emoji: "📒", label: "Contactos",            color: "#4A80BD", progress: 85, desc: "Libreta de contactos integrada." },
      { key: "notas",      emoji: "📝", label: "Notas",                color: "#4A80BD", progress: 70, desc: "Notas personales y compartidas." },
      { key: "reuniones",  emoji: "🎙️", label: "Reuniones",            color: "#4A80BD", progress: 40, desc: "Videollamadas y reuniones virtuales." },
      { key: "traduccion", emoji: "🌍", label: "Traducción automática", color: "#4A80BD", progress: 10, desc: "Traducción en tiempo real de mensajes." },
      { key: "grupos",     emoji: "👥", label: "Grupos",                color: "#4A80BD", progress: 25, desc: "Grupos de conversación y equipos." },
      { key: "multinivel", emoji: "🌐", label: "Multinivel",            color: "#4A80BD", progress: 5,  desc: "Comunicación multi-nivel jerárquico." },
      { key: "enviosMas",  emoji: "📢", label: "Envíos masivos",        color: "#4A80BD", progress: 5,  desc: "Notificaciones y mensajes masivos." },
      { key: "iaConv",     emoji: "🤖", label: "IA conversacional",     color: "#4A80BD", progress: 20, desc: "Asistente IA integrado en el chat." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     4. GO EMPRESA
  ══════════════════════════════════════════════════════ */
  {
    key: "empresa", emoji: "🟣", label: "GO EMPRESA", color: "#7C69BE", progress: 20,
    desc: "Ecosistema superior de actividad empresarial.",
    children: [
      {
        key: "servicios", emoji: "🔧", label: "GO Servicios", color: "#9b59b6", progress: 15,
        desc: "Servicios para particulares y empresas.",
        children: [
          { key: "peluquerias",  emoji: "✂️", label: "Peluquerías",             color: "#9b59b6", progress: 40, desc: "Reservas en peluquerías y barberías." },
          { key: "restaurantes", emoji: "🍽️", label: "Restaurantes",            color: "#9b59b6", progress: 40, desc: "Reservas en restaurantes." },
          { key: "hoteles",      emoji: "🏨", label: "Hoteles",                 color: "#9b59b6", progress: 0,  desc: "Reservas y gestión hotelera." },
          { key: "clinicas",     emoji: "🏥", label: "Clínicas",                color: "#9b59b6", progress: 0,  desc: "Citas médicas y clínicas." },
          { key: "gimnasios",    emoji: "🏋️", label: "Gimnasios",               color: "#9b59b6", progress: 0,  desc: "Reservas de instalaciones deportivas." },
          { key: "autonomos",    emoji: "👤", label: "Profesionales autónomos", color: "#9b59b6", progress: 0,  desc: "Directorio de profesionales independientes." },
          { key: "domicilio",    emoji: "🏠", label: "Servicios a domicilio",   color: "#9b59b6", progress: 0,  desc: "Servicios que van al cliente." },
          { key: "svcEmpresas",  emoji: "🏢", label: "Servicios para empresas", color: "#9b59b6", progress: 0,  desc: "B2B de servicios profesionales." },
          { key: "reservasSvc",  emoji: "📆", label: "Reservas de servicios",   color: "#9b59b6", progress: 70, desc: "Motor de reservas integrado." },
          {
            key: "prl", emoji: "🦺", label: "GO PRL", color: "#C25A5A", progress: 70,
            desc: "Prevención de riesgos laborales.",
            children: [
              { key: "extintores",   emoji: "🧯", label: "Extintores",              color: "#C25A5A", progress: 35, desc: "Control y revisión de extintores." },
              { key: "epi",          emoji: "🥽", label: "EPI",                     color: "#C25A5A", progress: 10, desc: "Gestión de equipos de protección individual." },
              { key: "auditorias",   emoji: "📋", label: "Auditorías",              color: "#C25A5A", progress: 5,  desc: "Auditorías de seguridad periódicas." },
              { key: "senializacion",emoji: "⚠️", label: "Señalización",            color: "#C25A5A", progress: 0,  desc: "Señalización de riesgos y seguridad." },
              { key: "salidas",      emoji: "🚪", label: "Salidas de emergencia",   color: "#C25A5A", progress: 0,  desc: "Control de vías de evacuación." },
              { key: "planesEvac",   emoji: "🗺️", label: "Planes de evacuación",    color: "#C25A5A", progress: 0,  desc: "Planes y simulacros de evacuación." },
              { key: "formacion",    emoji: "📚", label: "Formación",               color: "#C25A5A", progress: 5,  desc: "Formación en PRL para empleados." },
              { key: "revisiones",   emoji: "🔍", label: "Revisiones",              color: "#C25A5A", progress: 0,  desc: "Revisiones periódicas reglamentarias." },
              { key: "docPRL",       emoji: "📄", label: "Documentación PRL",       color: "#C25A5A", progress: 0,  desc: "Gestión documental de PRL." },
              { key: "clientesPRL",  emoji: "🏢", label: "Empresas cliente PRL",    color: "#C25A5A", progress: 0,  desc: "Cartera de clientes del servicio PRL." },
            ],
          },
        ],
      },
      {
        key: "industry", emoji: "🏭", label: "GO Industry", color: "#C4883A", progress: 8,
        desc: "Procesos industriales y producción.",
        children: [
          { key: "produccion",   emoji: "⚙️", label: "Producción",          color: "#C4883A", progress: 15, desc: "Control de producción y líneas." },
          { key: "mantenimiento",emoji: "🔧", label: "Mantenimiento",        color: "#C4883A", progress: 20, desc: "Gestión de mantenimiento industrial." },
          { key: "logInterna",   emoji: "📦", label: "Logística interna",    color: "#C4883A", progress: 15, desc: "Movimiento interno de materiales." },
          { key: "sensores",     emoji: "📡", label: "Sensores",             color: "#C4883A", progress: 5,  desc: "Red de sensores industriales." },
          { key: "alarmas",      emoji: "🔔", label: "Alarmas",              color: "#C4883A", progress: 5,  desc: "Sistema de alarmas de planta." },
          { key: "kpis",         emoji: "📊", label: "KPIs",                 color: "#C4883A", progress: 10, desc: "Indicadores clave de producción." },
          { key: "planos",       emoji: "📐", label: "Planos industriales",  color: "#C4883A", progress: 5,  desc: "Planos y esquemas de instalaciones." },
          { key: "averias",      emoji: "⚡", label: "Averías predictivas",  color: "#C4883A", progress: 100,  desc: "Mantenimiento predictivo por IA." },
          { key: "materias",     emoji: "🧱", label: "Materias primas",      color: "#C4883A", progress: 0,  desc: "Control de stock de materias primas." },
          { key: "capacidad",    emoji: "📈", label: "Capacidad productiva", color: "#C4883A", progress: 0,  desc: "Análisis de capacidad de producción." },
          { key: "compartirI",   emoji: "🔄", label: "Compartir",            color: "#C4883A", progress: 0,  desc: "Motor transversal — compartir recursos." },
          { key: "tengoQuieroI", emoji: "🔁", label: "Tengo / Quiero",       color: "#C4883A", progress: 0,  desc: "Motor transversal — intercambio." },
        ],
      },
      { key: "reservasEmp",  emoji: "📆", label: "Reservas empresa",   color: "#7C69BE", progress: 70, desc: "Motor de reservas para negocios." },
      { key: "rutasEmp",     emoji: "🗺️", label: "Rutas empresa",       color: "#7C69BE", progress: 60, desc: "Gestión de rutas y repartos." },
      { key: "crm",          emoji: "🤝", label: "CRM",                  color: "#7C69BE", progress: 10, desc: "Gestión de clientes y relaciones." },
      { key: "docEmp",       emoji: "📄", label: "Documentación",        color: "#7C69BE", progress: 10, desc: "Gestión documental empresarial." },
      { key: "b2b",          emoji: "🏢", label: "Marketplace B2B",      color: "#7C69BE", progress: 0,  desc: "Compraventa entre empresas." },
      { key: "comprasEmp",   emoji: "🛒", label: "Compras empresa",      color: "#7C69BE", progress: 0,  desc: "Gestión de compras corporativas." },
      { key: "compartirE",   emoji: "🔄", label: "Compartir",            color: "#7C69BE", progress: 0,  desc: "Motor transversal — compartir recursos entre empresas del ecosistema." },
      { key: "tengoQuieroE", emoji: "🔁", label: "Tengo / Quiero",       color: "#7C69BE", progress: 0,  desc: "Motor transversal — intercambio." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     5. GO LOGÍSTICA
  ══════════════════════════════════════════════════════ */
  {
    key: "logistica", emoji: "🚛", label: "GO LOGÍSTICA", color: "#0ea5e9", progress: 10,
    desc: "Mueve personas, productos, materias primas y servicios entre todos los módulos.",
    children: [
      { key: "transpPersonas",  emoji: "🚶", label: "Transporte personas",    color: "#0ea5e9", progress: 0,  desc: "Movilidad de personas bajo demanda." },
      { key: "transpMercancias",emoji: "📦", label: "Transporte mercancías",  color: "#0ea5e9", progress: 0,  desc: "Envío y recepción de mercancías." },
      { key: "ultimaMilla",     emoji: "🏠", label: "Última milla",           color: "#0ea5e9", progress: 0,  desc: "Entrega final al destinatario." },
      { key: "rutasInt",        emoji: "🧠", label: "Rutas inteligentes",     color: "#0ea5e9", progress: 20, desc: "Optimización de rutas con IA." },
      { key: "agendaRutas",     emoji: "📅", label: "Agenda y rutas",         color: "#0ea5e9", progress: 60, desc: "Planificación de rutas y jornadas." },
      { key: "zonasTarifas",    emoji: "💶", label: "Zonas y tarifas",        color: "#0ea5e9", progress: 50, desc: "Gestión de zonas de cobertura y precios." },
      { key: "compartirRutas",  emoji: "🔄", label: "Compartir rutas",        color: "#0ea5e9", progress: 0,  desc: "Motor transversal — compartir recorridos." },
      { key: "flotas",          emoji: "🚚", label: "Flotas",                 color: "#0ea5e9", progress: 0,  desc: "Gestión de flota de vehículos." },
      { key: "almacenes",       emoji: "🏭", label: "Almacenes",              color: "#0ea5e9", progress: 0,  desc: "Control de almacenes y stock." },
      { key: "gps",             emoji: "📡", label: "Seguimiento GPS",        color: "#0ea5e9", progress: 0,  desc: "Trazabilidad en tiempo real." },
      { key: "optIA",           emoji: "🤖", label: "Optimización IA",        color: "#0ea5e9", progress: 0,  desc: "IA para eficiencia logística." },
      { key: "transpCompL",     emoji: "🚌", label: "Transporte compartido",  color: "#0ea5e9", progress: 0,  desc: "Motor transversal — viajes compartidos." },
      { key: "uberChildrenL",   emoji: "🚸", label: "Uber Children conexión", color: "#0ea5e9", progress: 0,  desc: "Enlace con el módulo Uber Children de Humanity." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     6. GO IA
  ══════════════════════════════════════════════════════ */
  {
    key: "ia", emoji: "🟡", label: "GO IA", color: "#f59e0b", progress: 13,
    desc: "Motor de interpretación, automatización y sugerencias.",
    children: [
      { key: "interpretacion", emoji: "🔮", label: "Interpretación",     color: "#f59e0b", progress: 30, desc: "Análisis e interpretación de datos." },
      { key: "automatizacion", emoji: "⚙️", label: "Automatizaciones",   color: "#f59e0b", progress: 20, desc: "Flujos y acciones automáticas." },
      { key: "sugerencias",    emoji: "💡", label: "Sugerencias",         color: "#f59e0b", progress: 25, desc: "Recomendaciones personalizadas." },
      { key: "prediccion",     emoji: "📈", label: "Predicción",          color: "#f59e0b", progress: 5,  desc: "Modelos predictivos de comportamiento." },
      { key: "asistente",      emoji: "🤖", label: "Ayudante personal",   color: "#f59e0b", progress: 10, desc: "IA personal integrada en GO." },
      { key: "iaEmpresarial",  emoji: "🏢", label: "IA empresarial",      color: "#f59e0b", progress: 5,  desc: "IA orientada a procesos de negocio." },
      { key: "iaEtica",        emoji: "👽", label: "IA ética",            color: "#f59e0b", progress: 0,  desc: "Supervisión ética de modelos IA." },
      { key: "iaLogistica",    emoji: "🚛", label: "IA logística",        color: "#f59e0b", progress: 0,  desc: "IA para optimización logística." },
      { key: "iaReservas",     emoji: "📆", label: "IA de reservas",      color: "#f59e0b", progress: 0,  desc: "Asistente de reservas inteligente." },
    ],
  },

  /* ══════════════════════════════════════════════════════
     7. GO NEGOCIO
  ══════════════════════════════════════════════════════ */
  {
    key: "negocio", emoji: "💰", label: "GO NEGOCIO", color: "#C4883A", progress: 10,
    desc: "Monetización, facturación y control económico.",
    children: [
      { key: "suscripciones",  emoji: "🔄", label: "Suscripciones",         color: "#C4883A", progress: 20, desc: "Modelos de suscripción por módulo." },
      { key: "facturacion",    emoji: "🧾", label: "Facturación",            color: "#C4883A", progress: 10, desc: "Emisión y gestión de facturas." },
      { key: "pagos",          emoji: "💳", label: "Pagos",                  color: "#C4883A", progress: 20, desc: "Pasarela de cobros integrada." },
      { key: "modContratados", emoji: "📦", label: "Módulos contratados",    color: "#C4883A", progress: 15, desc: "Gestión de módulos activos por empresa." },
      { key: "comisiones",     emoji: "💹", label: "Comisiones",             color: "#C4883A", progress: 5,  desc: "Cálculo y reparto de comisiones." },
      { key: "licencias",      emoji: "📜", label: "Licencias",              color: "#C4883A", progress: 0,  desc: "Gestión de licencias de uso." },
      { key: "inversionMod",   emoji: "💎", label: "Inversión por módulos",  color: "#C4883A", progress: 0,  desc: "Participación inversora por módulo." },
      { key: "participaciones", emoji: "🗺️", label: "Participaciones por zona",color: "#C4883A",progress: 0, desc: "Inversión y retorno por zona geográfica." },
      { key: "costes",         emoji: "📉", label: "Costes por módulo",      color: "#C4883A", progress: 0,  desc: "Control de costes por módulo." },
    ],
  },
];

const CHIPS_VISIBLE = 3;

// ─── Estadísticas globales ────────────────────────────────────────────────────
function flattenNodes(nodes: RoadmapNode[]): RoadmapNode[] {
  return nodes.flatMap(n => [n, ...(n.children ? flattenNodes(n.children) : [])]);
}
const ALL_NODES     = flattenNodes(ROADMAP_TREE);
const TOTAL_MODS    = ROADMAP_TREE.length;
const TOTAL_SUBNODS = ALL_NODES.length - TOTAL_MODS;
const TOTAL_DONE    = ALL_NODES.filter(n => n.progress === 100).length;
const AVG_PROGRESS  = Math.round(
  ROADMAP_TREE.reduce((s, n) => s + n.progress, 0) / ROADMAP_TREE.length
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface GoRoadmapScreenProps {
  navStack:     RoadmapNode[];
  setNavStack:  (stack: RoadmapNode[]) => void;
  onGoLanding?: () => void;
}

// ─── Componente principal ────────────────────────────────────────────────────
export function GoRoadmapScreen({ navStack, setNavStack, onGoLanding }: GoRoadmapScreenProps) {
  const { lang } = useLanguage();
  const push = (node: RoadmapNode) => setNavStack([...navStack, node]);

  if (navStack.length === 0) {
    return <RootList nodes={ROADMAP_TREE} onOpen={push} lang={lang} />;
  }

  const current = navStack[navStack.length - 1];
  return (
    <NodeDetail
      node={current}
      breadcrumb={navStack.map(n => nodeLabel(n, lang))}
      onOpen={push}
      lang={lang}
      onGoLanding={onGoLanding}
    />
  );
}

// ─── Vista raíz ──────────────────────────────────────────────────────────────
function RootList({ nodes, onOpen, lang }: {
  nodes: RoadmapNode[];
  onOpen: (n: RoadmapNode) => void;
  lang: string;
}) {
  const [infoNode, setInfoNode] = React.useState<RoadmapNode | null>(null);
  return (
    <>
    <ScrollView
      style={s.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
    >
      <View style={s.infoBanner}>
        <Feather name="map" size={13} color="#f59e0b" />
        <Text style={s.infoBannerTxt}>
          {lang === 'en'
            ? "GO ecosystem master tree · Internal use only"
            : "Árbol maestro del ecosistema GO · Solo visible internamente"}
        </Text>
      </View>

      <View style={s.globalRow}>
        <GlobalStat label={lang === 'en' ? "Modules"    : "Módulos"}     value={`${TOTAL_MODS}`}    color="#4A80BD" />
        <GlobalStat label={lang === 'en' ? "Avg. prog." : "Avance med."} value={`${AVG_PROGRESS}%`} color="#3D9A84" />
        <GlobalStat label={lang === 'en' ? "Nodes"      : "Nodos"}       value={`${TOTAL_SUBNODS}`} color="#7C69BE" />
        <GlobalStat label={lang === 'en' ? "Done"       : "Terminados"}  value={`${TOTAL_DONE}`}    color="#f59e0b" />
      </View>

      <Text style={s.secTitle}>{lang === 'en' ? "ROOT MODULES" : "MÓDULOS MADRE"}</Text>

      {nodes.map(mod => {
        const chips  = (mod.children ?? []).slice(0, CHIPS_VISIBLE);
        const extras = (mod.children?.length ?? 0) - CHIPS_VISIBLE;
        return (
          <TouchableOpacity
            key={mod.key}
            activeOpacity={0.82}
            onPress={() => onOpen(mod)}
            style={[s.modCard, { position: "relative" }]}
          >
            <RootInfoButton color={mod.color} onPress={() => setInfoNode(mod)} />
            <View style={s.modTop}>
              <View style={[s.modEmojiBg, { backgroundColor: mod.color + "22" }]}>
                <Text style={s.modEmoji}>{mod.emoji}</Text>
              </View>
              <View style={{ flex: 1, paddingRight: 22 }}>
                <Text
                  style={[
                    s.modLabel,
                    { color: mod.color },
                    mod.key === "comunicacion" && lang === "en" && s.modLabelCommEn,
                  ]}
                >
                  {nodeLabel(mod, lang)}
                </Text>
                <Text style={s.modDesc} numberOfLines={1}>{nodeDesc(mod, lang)}</Text>
              </View>
              <Text style={[s.modPct, { color: mod.color }]}>{mod.progress}%</Text>
              <Feather name="chevron-right" size={15} color={mod.color + "80"} style={{ marginLeft: 4 }} />
            </View>

            <View style={[s.barBg, { backgroundColor: mod.color + "22" }]}>
              <View style={[s.barFill, { width: `${mod.progress}%` as any, backgroundColor: mod.color }]} />
            </View>

            <View style={s.modFooter}>
              <Text style={[s.avanceLbl, { color: mod.color }]}>
                {lang === 'en' ? "PROGRESS:" : "AVANCE:"} {mod.progress}%
              </Text>
              <View style={[s.statusChip, { borderColor: statusColor(mod.progress) + "50", backgroundColor: statusColor(mod.progress) + "18" }]}>
                <Text style={[s.statusTxt, { color: statusColor(mod.progress) }]}>
                  {statusFromProgress(mod.progress, lang)}
                </Text>
              </View>
            </View>

            <View style={s.chipsRow}>
              {chips.map(c => (
                <View key={c.key} style={[s.chip, { borderColor: mod.color + "35" }]}>
                  <Text style={[s.chipTxt, { color: mod.color }]}>{nodeLabel(c, lang)}</Text>
                </View>
              ))}
              {extras > 0 && (
                <View style={[s.chip, { borderColor: mod.color + "35" }]}>
                  <Text style={[s.chipTxt, { color: mod.color }]}>+{extras}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    <RootInfoModal node={infoNode} onClose={() => setInfoNode(null)} lang={lang} />
    </>
  );
}

// ─── Vista de detalle de un nodo ─────────────────────────────────────────────
function NodeDetail({ node, breadcrumb, onOpen, lang, onGoLanding }: {
  node:         RoadmapNode;
  breadcrumb:   string[];
  onOpen:       (n: RoadmapNode) => void;
  lang:         string;
  onGoLanding?: () => void;
}) {
  const insets    = useSafeAreaInsets();
  const fabBottom = insets.bottom + 24;
  const children  = node.children ?? [];
  const completados = children.filter(c => c.progress === 100).length;
  const enProgreso  = children.filter(c => c.progress > 0 && c.progress < 100).length;
  const pendientes  = children.filter(c => c.progress === 0).length;
  // Los botones "i" en esta vista aplican cuando `node` es uno de los 7
  // bloques madre (sus hijos = módulos de nivel 2), o cuando `node` es uno de
  // los padres de nivel 2 con extensión puntual a nivel 3: GO Servicios,
  // GO Industry y Ética 55 (sus hijos = submódulos de nivel 3).
  const isRootLevel = ROOT_KEYS.includes(node.key) || LEVEL3_INFO_PARENT_KEYS.includes(node.key);
  const [infoNode, setInfoNode] = React.useState<RoadmapNode | null>(null);
  const [eticaModule, setEticaModule] = React.useState<{ key: string; label: string; color: string } | null>(null);

  return (
    <>
    <ScrollView
      style={s.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
    >
      {/* Breadcrumb */}
      <View style={s.breadcrumb}>
        {breadcrumb.map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Feather name="chevron-right" size={10} color={DIM} style={{ marginHorizontal: 3 }} />}
            <Text style={[s.breadcrumbTxt, i === breadcrumb.length - 1 && { color: node.color }]}>
              {label}
            </Text>
          </React.Fragment>
        ))}
      </View>

      {/* Header del nodo */}
      <View style={[s.detHeader, { borderColor: node.color + "30" }]}>
        <View style={s.detHeaderTop}>
          <Text style={s.detEmoji}>{node.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.detLabel, { color: node.color }]}>{nodeLabel(node, lang)}</Text>
            <Text style={s.detDesc}>{nodeDesc(node, lang)}</Text>
          </View>
          <Text style={[s.detPct, { color: node.color }]}>{node.progress}%</Text>
        </View>
        <View style={[s.barBg, { backgroundColor: node.color + "22", marginTop: 10 }]}>
          <View style={[s.barFill, { width: `${node.progress}%` as any, backgroundColor: node.color }]} />
        </View>
        <View style={[s.modFooter, { marginTop: 8 }]}>
          <Text style={[s.avanceLbl, { color: node.color }]}>
            {lang === 'en' ? "PROGRESS:" : "AVANCE:"} {node.progress}%
          </Text>
          <View style={[s.statusChip, { borderColor: statusColor(node.progress) + "50", backgroundColor: statusColor(node.progress) + "18" }]}>
            <Text style={[s.statusTxt, { color: statusColor(node.progress) }]}>
              {statusFromProgress(node.progress, lang)}
            </Text>
          </View>
        </View>
      </View>

      {/* Estadísticas del nodo */}
      {children.length > 0 && (
        <View style={s.detStats}>
          <DetStat label={lang === 'en' ? "Done"        : "Terminados"}  value={`${completados}`} color="#3D9A84" />
          <DetStat label={lang === 'en' ? "In progress" : "En progreso"} value={`${enProgreso}`}  color={node.color} />
          <DetStat label={lang === 'en' ? "Pending"     : "Pendientes"}  value={`${pendientes}`}  color="#555" />
        </View>
      )}

      {/* Ética 11/99 — acceso único por módulo, en su pantalla de detalle */}
      <TouchableOpacity
        onPress={() => setEticaModule({ key: node.key, label: nodeLabel(node, lang), color: node.color })}
        activeOpacity={0.75}
        style={{ marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10,
          paddingVertical: 9, paddingHorizontal: 12,
          backgroundColor: "rgba(61,154,132,0.08)", borderRadius: 10,
          borderWidth: 1, borderColor: "rgba(61,154,132,0.22)" }}
      >
        <Feather name="hexagon" size={14} color="#3D9A84" />
        <Text style={{ flex: 1, color: "#3D9A84", fontSize: 13, fontWeight: "700" }}>
          {lang === 'en' ? "Ethics 11/99" : "Ética 11/99"}
        </Text>
        <Feather name="chevron-right" size={13} color="rgba(61,154,132,0.50)" />
      </TouchableOpacity>

      {/* Lista de hijos */}
      {children.length > 0 && (
        <>
          <Text style={s.secTitle}>
            {children.some(c => c.children)
              ? (lang === 'en' ? "MODULES" : "MÓDULOS")
              : (lang === 'en' ? "SUBMODULES" : "SUBMÓDULOS")}
          </Text>
          {children.map(child => {
            const hasChildren = (child.children?.length ?? 0) > 0;
            const sc = statusColor(child.progress);
            const chips  = (child.children ?? []).slice(0, CHIPS_VISIBLE);
            const extras = (child.children?.length ?? 0) - CHIPS_VISIBLE;

            if (hasChildren) {
              return (
                <TouchableOpacity
                  key={child.key}
                  activeOpacity={0.82}
                  onPress={() => onOpen(child)}
                  style={[s.childCard, { borderColor: child.color + "35" }, isRootLevel && { position: "relative" }]}
                >
                  {isRootLevel && <RootInfoButton color={child.color} onPress={() => setInfoNode(child)} />}
                  <View style={s.childTop}>
                    <View style={[s.childEmojiBg, { backgroundColor: child.color + "22" }]}>
                      <Text style={s.childEmoji}>{child.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, paddingRight: isRootLevel ? 20 : 0 }}>
                      <Text style={[s.childLabel, { color: child.color }]}>{nodeLabel(child, lang)}</Text>
                      <Text style={s.childDesc} numberOfLines={1}>{nodeDesc(child, lang)}</Text>
                    </View>
                    <Text style={[s.childPct, { color: child.color }]}>{child.progress}%</Text>
                    <Feather name="chevron-right" size={14} color={child.color + "80"} style={{ marginLeft: 4 }} />
                  </View>
                  <View style={[s.barBg, { backgroundColor: child.color + "22", height: 3, marginTop: 8 }]}>
                    <View style={[s.barFill, { width: `${child.progress}%` as any, backgroundColor: child.color, height: 3 }]} />
                  </View>
                  <View style={[s.modFooter, { marginTop: 6 }]}>
                    <View style={s.chipsRow}>
                      {chips.map(c => (
                        <View key={c.key} style={[s.chip, { borderColor: child.color + "30" }]}>
                          <Text style={[s.chipTxt, { color: child.color }]}>{nodeLabel(c, lang)}</Text>
                        </View>
                      ))}
                      {extras > 0 && (
                        <View style={[s.chip, { borderColor: child.color + "30" }]}>
                          <Text style={[s.chipTxt, { color: child.color }]}>+{extras}</Text>
                        </View>
                      )}
                    </View>
                    <View style={[s.statusChip, { borderColor: sc + "50", backgroundColor: sc + "18" }]}>
                      <Text style={[s.statusTxt, { color: sc }]}>{statusFromProgress(child.progress, lang)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }

            return (
              <View key={child.key} style={[s.leafCard, isRootLevel && { position: "relative" }]}>
                {isRootLevel && <RootInfoButton color={child.color} onPress={() => setInfoNode(child)} />}
                <View style={s.leafRow}>
                  <Text style={s.leafEmoji}>{child.emoji}</Text>
                  <View style={{ flex: 1, paddingRight: isRootLevel ? 20 : 0 }}>
                    <Text style={s.leafLabel}>{nodeLabel(child, lang)}</Text>
                    <Text style={s.leafDesc} numberOfLines={1}>{nodeDesc(child, lang)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 3 }}>
                    <Text style={[s.leafPct, { color: sc }]}>{child.progress}%</Text>
                    <View style={[s.statusChip, { borderColor: sc + "50", backgroundColor: sc + "18" }]}>
                      <Text style={[s.statusTxt, { color: sc }]}>{statusFromProgress(child.progress, lang)}</Text>
                    </View>
                  </View>
                </View>
                <View style={[s.barBg, { backgroundColor: "rgba(255,255,255,0.07)", height: 3, marginTop: 8 }]}>
                  <View style={[s.barFill, { width: `${child.progress}%` as any, backgroundColor: sc, height: 3 }]} />
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Nodo hoja sin hijos — el propio nodo es la unidad evaluable */}
      {children.length === 0 && (
        <View style={[s.leafCard, { opacity: 0.6 }]}>
          <Text style={{ color: DIM, fontSize: 12, textAlign: "center" }}>
            {lang === 'en' ? "No subtasks defined yet." : "Sin subtareas definidas aún."}
          </Text>
        </View>
      )}

    </ScrollView>

    {/* ── Modal Ética 11/99 — por módulo individual ──────────────────────── */}
    <Modal
      visible={!!eticaModule}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setEticaModule(null)}
    >
      <View style={{ flex: 1, backgroundColor: "#0D0E11" }}>
        <GoEticaScreen
          initialModule={eticaModule?.key}
          initialLabel={eticaModule?.label}
          initialColor={eticaModule?.color}
        />

        {/*
         * FAB de navegación — bloque único arrastrable, igual que el resto del ecosistema GO.
         * Los dos botones forman un único cluster: se mueven juntos, misma posición que
         * Calendario, Reservas, Marketplace, Empresa, etc.
         *   • Botón superior (↓ simple)  — volver al Roadmap
         *   • Botón inferior (↓↓ doble) — ir al Landing
         */}
        <DraggableFAB
          screenKey="etica_modal"
          buttonKey="nav"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={98}
        >
          {/* ↓ simple — volver al Roadmap */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEticaModule(null)}
            hitSlop={8}
            accessibilityLabel={lang === 'en' ? "Back" : "Volver"}
            style={ETICA_FAB_BTN}
          >
            <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.90)" />
          </TouchableOpacity>

          {/* ↓↓ doble — ir al Landing (mismo método que el resto de GO) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setEticaModule(null);
              // Esperar a que el modal ético cierre antes de navegar al Landing,
              // igual que hacen el resto de pantallas con paneles apilados.
              setTimeout(() => onGoLanding?.(), 350);
            }}
            hitSlop={8}
            accessibilityLabel={lang === 'en' ? "Go to Landing" : "Ir al Landing"}
            style={ETICA_FAB_BTN}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>
      </View>
    </Modal>

    {isRootLevel && <RootInfoModal node={infoNode} onClose={() => setInfoNode(null)} lang={lang} />}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function GlobalStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.gStatCard, { borderColor: color + "28" }]}>
      <Text style={[s.gStatVal, { color }]}>{value}</Text>
      <Text style={s.gStatLabel}>{label}</Text>
    </View>
  );
}
function DetStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.detStatCard, { borderColor: color + "28" }]}>
      <Text style={[s.detStatVal, { color }]}>{value}</Text>
      <Text style={s.detStatLabel}>{label}</Text>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },

  infoBanner:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.10)", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.20)" },
  infoBannerTxt: { fontSize: 11, color: "#FFFFFF", fontWeight: "600", flex: 1, lineHeight: 15 },

  globalRow:    { flexDirection: "row", gap: 8, marginBottom: 20 },
  gStatCard:    { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1 },
  gStatVal:     { fontSize: 16, fontWeight: "900" },
  gStatLabel:   { fontSize: 8, color: DIM, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 },

  secTitle:     { fontSize: 10, fontWeight: "700", color: DIM, letterSpacing: 0.8, marginBottom: 10 },

  modCard:      { backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORD },
  modTop:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  modEmojiBg:   { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  modEmoji:     { fontSize: 18, lineHeight: 22 },
  modLabel:     { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  modLabelCommEn: { fontSize: 11, letterSpacing: 0 },
  modDesc:      { fontSize: 11, color: DIM, marginTop: 1, fontWeight: "500" },
  modPct:       { fontSize: 16, fontWeight: "900" },
  modFooter:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  barBg:        { width: "100%", height: 4, borderRadius: 2 },
  barFill:      { height: 4, borderRadius: 2 },
  avanceLbl:    { fontSize: 9, fontWeight: "700", letterSpacing: 0.9, opacity: 0.75 },

  statusChip:   { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  statusTxt:    { fontSize: 9, fontWeight: "700" },

  chipsRow:     { flexDirection: "row", flexWrap: "wrap", gap: 5, flex: 1 },
  chip:         { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  chipTxt:      { fontSize: 9, fontWeight: "700" },

  breadcrumb:    { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 12, opacity: 0.7 },
  breadcrumbTxt: { fontSize: 10, color: DIM, fontWeight: "600" },

  detHeader:    { backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1 },
  detHeaderTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  detEmoji:     { fontSize: 28, lineHeight: 34 },
  detLabel:     { fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
  detDesc:      { fontSize: 12, color: DIM, marginTop: 3, lineHeight: 17 },
  detPct:       { fontSize: 26, fontWeight: "900" },

  detStats:     { flexDirection: "row", gap: 8, marginBottom: 18 },
  detStatCard:  { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1 },
  detStatVal:   { fontSize: 18, fontWeight: "900" },
  detStatLabel: { fontSize: 8, color: DIM, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 },

  childCard:    { backgroundColor: CARD, borderRadius: 15, padding: 13, marginBottom: 8, borderWidth: 1 },
  childTop:     { flexDirection: "row", alignItems: "center", gap: 10 },
  childEmojiBg: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  childEmoji:   { fontSize: 16, lineHeight: 20 },
  childLabel:   { fontSize: 13, fontWeight: "700" },
  childDesc:    { fontSize: 10, color: DIM, marginTop: 1, fontWeight: "500" },
  childPct:     { fontSize: 15, fontWeight: "900" },

  leafCard:     { backgroundColor: CARD, borderRadius: 13, padding: 13, marginBottom: 7, borderWidth: 1, borderColor: BORD },
  leafRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  leafEmoji:    { fontSize: 16, lineHeight: 20 },
  leafLabel:    { fontSize: 13, fontWeight: "600", color: TEXT },
  leafDesc:     { fontSize: 10, color: DIM, marginTop: 1 },
  leafPct:      { fontSize: 14, fontWeight: "900" },

  rootInfoBtn:      { position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", zIndex: 5 },
  rootInfoBtnTxt:   { fontSize: 11, fontWeight: "900", fontStyle: "italic" },

  rootInfoOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 20 },
  rootInfoCard:     { width: "100%", maxHeight: "70%", backgroundColor: CARD, borderRadius: 18, borderWidth: 1, padding: 18 },
  rootInfoHeader:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  rootInfoEmoji:    { fontSize: 22, lineHeight: 26 },
  rootInfoTitle:    { fontSize: 16, fontWeight: "900", letterSpacing: 0.2, flex: 1 },
  rootInfoScroll:   { marginBottom: 14 },
  rootInfoBody:     { fontSize: 13, color: TEXT, lineHeight: 20, fontWeight: "500" },
  rootInfoCloseBtn: { borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  rootInfoCloseTxt: { fontSize: 13, fontWeight: "800", color: "#0D0E11" },
});
