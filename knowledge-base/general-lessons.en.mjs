const ministry = "Federal Democratic Republic of Ethiopia, Ministry of Education";

const source = (title, sourceFile, pageStart, pageEnd, extra = {}) => ({
  title,
  sourceFile,
  pageStart,
  pageEnd,
  verificationStatus: "located",
  ...extra,
});

export const generalKnowledgeEnglishDrafts = [
  {
    slug: "scientific-method",
    categorySlug: "science-discoveries",
    title: "From observation to a testable explanation",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Scientific explanations begin with questions about observations. A useful investigation does not treat a first guess as a proven fact: it makes a proposed explanation testable, gathers observations under stated conditions, and compares the results with the prediction. Repeating an investigation helps other people check whether the result can be reproduced.",
    objectives: [
      "Distinguish an observation, a question, a hypothesis, and a conclusion.",
      "Explain why a scientific hypothesis must be testable.",
      "Plan a simple comparison that records measurable results.",
    ],
    topics: [
      {
        title: "Questions and hypotheses",
        explanation: "An observation may be made directly with the senses or indirectly with a scientific instrument. A question narrows the observation to something that can be investigated. A hypothesis is a proposed explanation or answer that can be tested; it is not automatically true just because it sounds reasonable.",
        subtopics: [
          { title: "Make the question specific", explanation: "A focused question identifies what will be changed or compared and what evidence will be recorded." },
          { title: "State a prediction", explanation: "A prediction describes an observable result that would be expected if the hypothesis is supported under the stated conditions." },
        ],
      },
      {
        title: "Testing and conclusions",
        explanation: "An experiment follows a planned procedure and records results. A conclusion compares those results with the original prediction. Results that do not support a hypothesis are still useful: the explanation may need revision, and the next investigation can test a different explanation.",
        subtopics: [
          { title: "Repeatability", explanation: "A clear procedure lets another investigator repeat the work and compare findings rather than relying on an uncheckable claim." },
          { title: "Evidence before certainty", explanation: "A conclusion should describe what the recorded observations support and should not claim more than the investigation tested." },
        ],
      },
    ],
    definitions: [
      { term: "Observation", definition: "Information collected by noticing a feature or change, directly or with an instrument." },
      { term: "Hypothesis", definition: "A proposed scientific explanation or possible answer that can be tested." },
      { term: "Conclusion", definition: "An interpretation of recorded results in relation to the investigation question and prediction." },
    ],
    examples: [
      { title: "A torch that does not turn on", explanation: "Observe that the torch is dark, ask why, and propose a testable explanation such as depleted batteries. Replace the batteries while keeping the torch and switch the same, then record whether it lights. If it remains dark, the result does not support that explanation as the only cause; another hypothesis must be tested." },
      { title: "Comparing seed germination", explanation: "To investigate temperature, place similar bean seeds in groups at different temperatures, keep other conditions as similar as possible, and record germination time and seedling length. A chart makes the comparison easier to inspect. This is a classroom investigation, not a claim that temperature is the only factor affecting every seed." },
    ],
    exercises: [
      { prompt: "Write a testable question about whether the amount of light affects plant growth. Name one measurement and one condition that should be kept the same.", answer: "Example: Does daily light exposure affect the height of bean seedlings? Measure seedling height after the same number of days; keep seed type, water, soil, container, and starting size as similar as possible.", explanation: "A clear question names a comparison, a measurable outcome, and conditions that help make the comparison fair." },
      { prompt: "An experiment produces a result that does not match the prediction. Should the result be discarded?", answer: "No. Record it and use it to revise or test the explanation.", explanation: "Scientific conclusions depend on the observations actually recorded, not on whether the result was expected." },
    ],
    summary: "A scientific investigation connects observations to focused questions, testable hypotheses, planned measurements, and evidence-based conclusions. Repeating a procedure supports checking; unexpected results are information to explain, not a reason to hide the data.",
    revisionQuestions: [
      { question: "Why is a testable hypothesis different from an unsupported opinion?", answer: "It makes a proposed explanation that can be checked against observations or experimental results.", explanation: "A testable claim specifies evidence that could support or fail to support it." },
      { question: "What should a conclusion do after an experiment?", answer: "Compare the recorded results with the prediction and state what the evidence supports, including limits.", explanation: "A conclusion must be based on the actual data and should not overstate what was tested." },
    ],
    sources: [
      source("Biology Student Textbook, Grade 9, Unit 1: Introduction to Biology", "2_Biology_Grade_9_Students_TextBook_Final_Revised_1794581171278.pdf", 8, 9, { publisher: ministry, sourceKind: "user-provided textbook", note: "Local PDF page numbers; source metadata did not identify an author or publication year." }),
    ],
    relatedSlugs: ["evaluate-historical-evidence", "relations-and-functions"],
  },
  {
    slug: "ancient-civilizations",
    categorySlug: "world-history",
    title: "Comparing ancient civilizations through evidence",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "A comparison of ancient societies becomes clearer when it asks the same questions of each case: where people lived, how food and resources supported communities, how authority was organized, and what material or written evidence remains. The examples in this lesson are drawn from a Grade 9 Ethiopian history textbook and are presented as a starting point for comparison, not as a complete account of any civilization.",
    objectives: [
      "Compare selected ancient societies using place, livelihood, organization, and evidence.",
      "Explain how rivers, farming, trade, writing, and technology appear in the cited examples.",
      "Separate a textbook claim from a complete historical consensus.",
    ],
    topics: [
      {
        title: "Rivers, food, and settlement",
        explanation: "The textbook describes Egypt in the Nile Valley and the Sumerian cities between the Tigris and Euphrates. In both cases, water and productive land are connected to agriculture and settlement. It also describes the Indus Valley communities as using canals to support farming. These examples show why geographic setting is one useful comparison point, while not implying that every river society developed in the same way.",
        subtopics: [
          { title: "Livelihoods", explanation: "The text connects Egyptian agriculture and trade with the Nile Valley, and describes irrigation and fertile land in southern Mesopotamia." },
          { title: "Compare, do not flatten", explanation: "A shared feature such as river-based agriculture does not make the political systems, languages, or histories of two societies identical." },
        ],
      },
      {
        title: "Technology, writing, and exchange",
        explanation: "The textbook associates Egyptian hieroglyphic writing and papyrus with record keeping, and describes cuneiform in Mesopotamia. It describes Nubia's Meroe as a center of metal production and notes trade as a source of wealth. These are examples of different forms of knowledge and production; each claim should be traced to its cited section before being used as evidence.",
        subtopics: [
          { title: "Material evidence", explanation: "Tools, buildings, and manufactured objects can help historians ask how people produced goods and organized work." },
          { title: "Written evidence", explanation: "Writing systems preserve information, but readers still need to consider who created a record, for whom, and in what context." },
        ],
      },
    ],
    definitions: [
      { term: "Civilization", definition: "A broad term used to describe complex, organized societies; it should not be treated as a ranking of human worth." },
      { term: "Cuneiform", definition: "The writing system the cited textbook associates with ancient Mesopotamia." },
      { term: "Hieroglyphics", definition: "The writing system the cited textbook associates with ancient Egypt." },
    ],
    examples: [
      { title: "Use the same comparison questions", explanation: "For Egypt and Nubia, record the place named by the source, the livelihoods it describes, and one form of material or written evidence. Then note one difference instead of assuming that neighboring societies were identical." },
      { title: "Trace an achievement to evidence", explanation: "If a lesson states that a society used a writing system, identify the source passage that supports the statement and distinguish the textbook's account from an artifact or inscription that could be examined independently." },
    ],
    exercises: [
      { prompt: "Choose Egypt and Mesopotamia. Give one shared feature and one difference supported by the cited pages.", answer: "Example shared feature: both accounts connect agriculture with river environments. Example difference: the cited text names hieroglyphic writing for Egypt and cuneiform for Mesopotamia.", explanation: "The response should compare source-supported examples rather than claim that all parts of the societies were alike." },
      { prompt: "Why should a comparison include the source and its context?", answer: "Because historical summaries are interpretations, and evidence must be checked for origin, reliability, and limits.", explanation: "The same evidence can be described differently depending on who recorded it and what question is being asked." },
    ],
    summary: "Historical comparison is strongest when it uses a consistent set of questions and traceable evidence. The cited textbook links river settings with agriculture, and describes distinct writing, trade, and metalworking examples. These are starting points for inquiry, not a complete history.",
    revisionQuestions: [
      { question: "Name two questions that help compare ancient societies without treating them as identical.", answer: "Where did people live, how did they obtain resources, how was authority organized, or what evidence remains.", explanation: "A consistent comparison framework helps identify both similarities and differences." },
      { question: "Does one cited achievement prove that a civilization was superior to another?", answer: "No.", explanation: "Historical comparison explains differences and context; it does not rank societies by human worth." },
    ],
    sources: [
      source("History Student Textbook, Grade 9, Unit 2: Ancient World Civilizations up to c. 500 AD", "0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf", 29, 36, { author: "Desta Roba Julla; Tesfaye Masebo Melko", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided textbook" }),
    ],
    relatedSlugs: ["culture-through-material-evidence", "notable-historical-figures"],
  },
  {
    slug: "african-climate",
    categorySlug: "geography-countries",
    title: "Reading climate patterns across Africa",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Climate describes long-term patterns rather than the weather on one day. The Grade 10 Geography Teacher Guide used here discusses how latitude, altitude, relief, vegetation, air movement, and human activity can shape African climate patterns. Because this is a teacher guide, the lesson labels it clearly and does not claim that it is a student textbook or a complete country-by-country atlas.",
    objectives: [
      "Distinguish climate from day-to-day weather.",
      "Explain how latitude, altitude, and relief influence local climate patterns.",
      "Use a windward and leeward example to interpret rainfall differences.",
    ],
    topics: [
      {
        title: "Climate controls",
        explanation: "Latitude affects the angle and distribution of solar energy; the guide connects Africa's position across the equator and subtropical latitudes with its broad climate patterns. Altitude can lower temperature with increasing elevation. Relief affects how air moves over mountains, creating wetter windward slopes and drier leeward areas in the guide's example.",
        subtopics: [
          { title: "Latitude and seasonal rainfall", explanation: "The guide relates the movement of the Inter-Tropical Convergence Zone to rainfall patterns near the equator. These are regional patterns, not a forecast for a particular day." },
          { title: "Relief and rain shadow", explanation: "Moist air that rises over a mountain can cool and produce rainfall on the windward side; descending air on the leeward side may be drier." },
        ],
      },
      {
        title: "Reading regional descriptions",
        explanation: "The guide describes several climate regions, including equatorial, Mediterranean, warm temperate east-coast, continental, and mountain climates. A regional label summarizes recurring characteristics; it does not mean every location within that region has identical conditions. When comparing places, record the source, location, season, and the climate element being discussed.",
        subtopics: [
          { title: "Climate elements", explanation: "Temperature and rainfall are central elements in the guide's comparisons; a description should state which element is being compared." },
          { title: "Scale matters", explanation: "A continent-wide pattern should not be used as a precise local weather statement. A country, highland, coast, or valley may have important local differences." },
        ],
      },
    ],
    definitions: [
      { term: "Climate", definition: "The long-term pattern of weather conditions in a place." },
      { term: "Altitude", definition: "Height above sea level; the guide identifies it as one influence on climate." },
      { term: "Rain shadow", definition: "A relatively dry area on the leeward side of a relief barrier, as described in the cited guide." },
    ],
    examples: [
      { title: "A mountain cross-section", explanation: "Draw moist air approaching a mountain. Label the side facing the wind as windward and the opposite side as leeward. Use arrows to show air rising and then descending; explain why the guide expects more rainfall on the windward side and less on the rain-shadow side." },
      { title: "Comparing two places", explanation: "A highland and a nearby lowland can experience different temperatures because altitude differs. A good comparison names both locations and avoids saying that altitude is the only factor." },
    ],
    exercises: [
      { prompt: "A place lies on the leeward side of a mountain. Using the cited guide, explain one reason it may receive less rainfall than the windward side.", answer: "Air loses moisture as it rises on the windward side; descending air on the leeward side is drier and may produce a rain-shadow effect.", explanation: "Relief changes airflow and moisture distribution. It is one influence, not the only factor in local climate." },
      { prompt: "Why is a climate classification not the same as a daily weather forecast?", answer: "Climate summarizes long-term patterns, while a forecast describes expected short-term conditions.", explanation: "The two describe different time scales." },
    ],
    summary: "African climate patterns reflect multiple interacting controls. Latitude, altitude, and relief help explain broad regional differences; the teacher guide also discusses vegetation and human activity. Climate labels should be used at the scale they describe, not as exact local forecasts.",
    revisionQuestions: [
      { question: "Which side of a mountain is commonly called windward?", answer: "The side facing the prevailing incoming wind.", explanation: "The guide uses windward and leeward slopes to explain rainfall differences." },
      { question: "Name two controls of climate discussed in the source.", answer: "Any two of latitude, altitude, relief, vegetation, air movement, or human activity.", explanation: "The source describes several interacting influences." },
    ],
    sources: [
      source("Geography Teacher Guide, Grade 10, Unit 2: Climate of Africa", "0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf", 46, 60, { author: "Wondafrash Genet Degu; Kenate Worku Tabor", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided teacher guide", note: "Teacher-guide reference, not a student textbook." }),
    ],
    relatedSlugs: ["human-environment-interaction", "natural-resources-livelihoods"],
  },
  {
    slug: "balanced-nutrition",
    categorySlug: "health-human-biology",
    title: "Nutrition and balanced diets",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Food supports energy use, growth, tissue repair, and other functions. Nutrition is more than choosing one food that is described as healthy: the cited Grade 9 Biology textbook presents a balanced diet as a combination of nutrients in appropriate amounts and proportions. This lesson is educational and does not diagnose a condition or prescribe an individual diet.",
    objectives: [
      "Define nutrition, nutrient, and balanced diet.",
      "Describe the general roles of carbohydrates, proteins, fats, vitamins, minerals, water, and fibre.",
      "Explain how a deficiency can occur when the body does not receive enough of a needed nutrient.",
    ],
    topics: [
      {
        title: "Nutrients and their roles",
        explanation: "The textbook describes carbohydrates as an energy source, proteins as materials used in growth and cell building, and fats and oils as energy-rich nutrients. Vitamins and minerals are needed in smaller amounts for normal body processes. Water contributes to body fluids, while fibre supports bowel function. These categories work together; no single nutrient performs every role.",
        subtopics: [
          { title: "Energy and building materials", explanation: "Food energy supports activities, while proteins and other nutrients support growth and replacement of damaged tissues." },
          { title: "Small-quantity nutrients", explanation: "Vitamins and minerals are essential in smaller quantities; their importance does not depend on the amount being large." },
        ],
      },
      {
        title: "Balanced diet and deficiency",
        explanation: "A balanced diet includes suitable amounts of the needed nutrient groups, together with water and fibre. A deficiency disease may occur when a person lacks a particular nutrient over time. The textbook's lesson uses the concept to explain why varied sources of nutrients matter, but individual needs differ and medical questions should be discussed with a qualified health professional.",
        subtopics: [
          { title: "Proportion matters", explanation: "A diet can contain several food groups and still be unbalanced if the quantities or variety are unsuitable." },
          { title: "Educational limits", explanation: "A classroom definition explains a concept; it is not a personal diagnosis or treatment plan." },
        ],
      },
    ],
    definitions: [
      { term: "Nutrition", definition: "The process of taking in food and using it to obtain energy and other substances needed for life." },
      { term: "Nutrient", definition: "A chemical substance in food that the body uses for energy, growth, or other functions." },
      { term: "Balanced diet", definition: "A diet containing the required nutrients in appropriate amounts and proportions." },
      { term: "Deficiency disease", definition: "A health problem associated with not receiving enough of a particular nutrient." },
    ],
    examples: [
      { title: "Classify a food role", explanation: "If a lesson example asks what protein contributes, explain its role in growth and building or replacing cells. Do not claim that eating one protein-rich food alone creates a balanced diet." },
      { title: "Check a meal pattern", explanation: "A student can identify which nutrient groups appear in a meal and what might be missing, then describe the result as a classroom comparison rather than personal medical advice." },
    ],
    exercises: [
      { prompt: "Explain why a balanced diet is not defined as eating only one nutrient group.", answer: "Different nutrients have different roles, so a balanced diet needs suitable amounts and proportions across the required nutrient groups.", explanation: "Energy, growth, body processes, water balance, and fibre are not supplied by a single nutrient." },
      { prompt: "A learner says that vitamins are unimportant because only small amounts are needed. Correct the reasoning.", answer: "Small required amounts do not make a nutrient unimportant; vitamins are essential for normal body processes.", explanation: "Quantity and importance are different ideas." },
    ],
    summary: "Nutrition supplies energy and materials needed for life. Carbohydrates, proteins, fats, vitamins, minerals, water, and fibre have different roles. A balanced diet includes appropriate amounts and proportions; the textbook's general teaching should not be treated as individual medical advice.",
    revisionQuestions: [
      { question: "What makes a diet balanced?", answer: "It provides needed nutrients in appropriate amounts and proportions.", explanation: "Balance concerns both variety and suitable quantity." },
      { question: "What does the term deficiency disease describe?", answer: "A health problem associated with not receiving enough of a particular nutrient.", explanation: "The definition is general and does not diagnose an individual." },
    ],
    sources: [
      source("Biology Student Textbook, Grade 9, Unit 5: Human Health, Nutrition, and Disease", "2_Biology_Grade_9_Students_TextBook_Final_Revised_1794581171278.pdf", 109, 113, { publisher: ministry, sourceKind: "user-provided textbook", note: "Local PDF pages; the source map does not record an author or publication year." }),
      source("Biology Student Textbook, Grade 9, Unit 5 review", "2_Biology_Grade_9_Students_TextBook_Final_Revised_1794581171278.pdf", 140, 140, { publisher: ministry, sourceKind: "user-provided textbook" }),
    ],
    relatedSlugs: ["scientific-method"],
  },
  {
    slug: "political-organization-in-ethiopian-history",
    categorySlug: "politics-government",
    title: "Political organization in a historical setting",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Government is not organized in the same way in every place or period. The Grade 9 History textbook describes Ethiopian communities from the mid-sixteenth to the mid-nineteenth centuries as including independent polities and communities with different political arrangements. It distinguishes monarchical organization in some states from traditional systems in other communities, while also noting economic relationships among them. This is a bounded historical case, not a description of present-day Ethiopia.",
    objectives: [
      "Explain why political organization should be described with a time and place.",
      "Distinguish a monarchy from a decentralized arrangement in the cited historical summary.",
      "Identify examples of relationships among neighboring communities.",
    ],
    topics: [
      {
        title: "Authority and political organization",
        explanation: "The cited textbook describes multiple peoples and states with differing levels and forms of political organization. Some states had monarchic rule; some communities relied on traditional political systems. A careful account names the community and period rather than assuming one system applied uniformly across the country.",
        subtopics: [
          { title: "Monarchical rule", explanation: "The source uses monarchy for political organization in some states during the period it discusses." },
          { title: "Political diversity", explanation: "The source also identifies traditional political systems and locally autonomous polities; this shows why a single label can hide important differences." },
        ],
      },
      {
        title: "Connections across political boundaries",
        explanation: "Political independence did not mean isolation. The source describes relationships through trade, marriage, and conflicts over resources. These connections help explain how communities could maintain distinct political systems while still affecting one another.",
        subtopics: [
          { title: "Trade and exchange", explanation: "Trade can connect communities even when they have separate rulers or institutions." },
          { title: "Conflict and resources", explanation: "Competition over resources is one type of relationship recorded in the historical summary; it should be studied alongside cooperation and exchange." },
        ],
      },
    ],
    definitions: [
      { term: "Polity", definition: "An organized political community or state." },
      { term: "Monarchy", definition: "A form of political organization in which a monarch holds the central ruling position." },
      { term: "Decentralized authority", definition: "Political authority distributed among multiple local or regional centers rather than concentrated in one central authority." },
    ],
    examples: [
      { title: "Describe a historical system precisely", explanation: "Instead of writing 'Ethiopia was ruled by one system,' identify the period in the textbook, then state that it describes both monarchic states and communities organized through traditional political systems." },
      { title: "Map relationships", explanation: "Draw two neighboring communities and connect them with separate arrows for trade, marriage, and conflict over resources. The diagram shows that political boundaries do not prevent social and economic interaction." },
    ],
    exercises: [
      { prompt: "Why is it inaccurate to use a single political label for every community in the period described?", answer: "The source describes multiple communities and states with different political arrangements, including monarchies and traditional systems.", explanation: "Historical descriptions should preserve variation across place and community." },
      { prompt: "Name two types of relationship the cited source reports among communities.", answer: "Trade, marriage, and conflicts over resources; any two.", explanation: "The source describes both exchange and conflict." },
    ],
    summary: "The historical case shows political diversity and interconnection: some states were monarchic, while other communities used traditional political systems. Trade, marriage, and resource conflicts linked communities. The claims apply to the cited historical period, not to present-day governance.",
    revisionQuestions: [
      { question: "What does the source say about political organization in the period it covers?", answer: "It describes multiple communities with different arrangements, including monarchic states and traditional political systems.", explanation: "The lesson emphasizes diversity rather than a single uniform system." },
      { question: "How could independent polities still remain connected?", answer: "Through relationships such as trade, marriage, or conflict over resources.", explanation: "Political independence does not imply social or economic isolation." },
    ],
    sources: [
      source("History Student Textbook, Grade 9, Unit 8 summary: Political, Social and Economic Processes in Ethiopia, Mid-16th to Mid-19th Century", "0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf", 163, 193, { author: "Desta Roba Julla; Tesfaye Masebo Melko", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided textbook", note: "The source page range covers a broad unit; the specific passage used is on PDF page 193." }),
    ],
    relatedSlugs: ["evaluate-historical-evidence", "ancient-civilizations"],
  },
  {
    slug: "evaluate-historical-evidence",
    categorySlug: "philosophy-critical-thinking",
    title: "Evaluate a claim using historical evidence",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Critical thinking asks how a claim is supported, not only whether it sounds convincing. The cited history textbook explains that historical writing depends on sources and that sources should be evaluated before being used as evidence. This lesson adapts that source-evaluation method into a general reasoning routine. It does not claim to cover philosophy as a whole.",
    objectives: [
      "Distinguish primary and secondary sources using the cited definitions.",
      "Ask questions about authenticity, reliability, and context.",
      "Use more than one source when a claim needs checking.",
    ],
    topics: [
      {
        title: "Identify the kind of source",
        explanation: "The textbook describes primary sources as materials contemporary with the events under study, such as artifacts, inscriptions, letters, photographs, or records. Secondary sources reconstruct or interpret the past. A source's category depends on the question: a photograph may be primary evidence for what it depicts, but not necessarily for every explanation attached to it.",
        subtopics: [
          { title: "Primary evidence", explanation: "Ask who produced the material, when it was created, and how directly it relates to the event." },
          { title: "Secondary interpretation", explanation: "Ask which evidence an author used and whether the interpretation is reliable and transparent." },
        ],
      },
      {
        title: "Check and cross-check",
        explanation: "The textbook emphasizes checking primary sources for originality and authenticity, examining secondary-source reliability, and cross-checking oral accounts with other evidence. A strong conclusion states both what the evidence supports and what remains uncertain.",
        subtopics: [
          { title: "Context", explanation: "The creator's position, purpose, audience, and time can affect what a source records or leaves out." },
          { title: "Corroboration", explanation: "Independent sources that agree on a detail can strengthen confidence; disagreement should be investigated rather than hidden." },
        ],
      },
    ],
    definitions: [
      { term: "Primary source", definition: "A source contemporary with the event being studied and directly related to it." },
      { term: "Secondary source", definition: "A later account that reconstructs or interprets earlier events." },
      { term: "Corroboration", definition: "Checking a claim against additional evidence or sources." },
    ],
    examples: [
      { title: "A local event report", explanation: "Compare a person's account with a contemporaneous record and a later summary. Ask whether each source directly witnessed the event, what information it could know, and whether details agree." },
      { title: "A historical object", explanation: "An artifact may provide direct evidence that an object existed, but its date and use may require additional analysis. Do not infer a complete story from one object alone." },
    ],
    exercises: [
      { prompt: "A letter written during an event and a textbook chapter written decades later describe that event. Which is primary and which is secondary under the cited definitions?", answer: "The contemporary letter is primary; the later textbook chapter is secondary.", explanation: "The distinction depends on the source's relationship in time to the event and whether it is a later reconstruction." },
      { prompt: "Name two questions to ask before treating a source as reliable evidence.", answer: "Who created it and when? Is it authentic? What was its purpose or audience? Can another source corroborate it?", explanation: "Provenance, authenticity, context, and corroboration help evaluate claims." },
    ],
    summary: "A claim should be tested against evidence. Identify the source type, check origin and context, assess reliability, and corroborate important details. Evidence supports careful conclusions, not certainty beyond what the sources can establish.",
    revisionQuestions: [
      { question: "Why should oral information be cross-checked?", answer: "To examine its accuracy and reduce the risk of changes or distortion over time.", explanation: "The textbook recommends comparison with other source types." },
      { question: "Does a primary source automatically prove every claim made about it?", answer: "No.", explanation: "Primary sources still need checks for authenticity, context, and relevance to the claim." },
    ],
    sources: [
      source("History Student Textbook, Grade 9, Unit 1: The Discipline of History and Human Evolution", "0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf", 12, 13, { author: "Desta Roba Julla; Tesfaye Masebo Melko", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided textbook" }),
    ],
    relatedSlugs: ["ancient-civilizations", "political-organization-in-ethiopian-history"],
  },
  {
    slug: "culture-through-material-evidence",
    categorySlug: "culture-civilization",
    title: "What material and written evidence can reveal",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Buildings, tools, writing, and production methods can help explain how communities organized knowledge and everyday life. A Grade 9 History textbook provides examples from ancient Egypt, Nubia, Mesopotamia, India, and China. This lesson uses those examples to ask what evidence can reveal—and what it cannot—about a society's culture.",
    objectives: [
      "Identify material and written evidence in the cited examples.",
      "Connect evidence to questions about production, communication, and social organization.",
      "Avoid treating one artifact or text as a complete description of a culture.",
    ],
    topics: [
      {
        title: "Material evidence and production",
        explanation: "The cited textbook discusses pyramids, irrigation, metalworking, tools, and buildings. Such evidence can raise questions about the skills, materials, labor, and institutions involved. An object does not explain itself: its date, use, and meaning need context and supporting evidence.",
        subtopics: [
          { title: "Objects and technologies", explanation: "Tools and manufactured goods can show what materials were worked and what technical processes were used." },
          { title: "Buildings and labor", explanation: "Large structures invite questions about planning, resources, labor, and political organization; the structure alone does not answer all of them." },
        ],
      },
      {
        title: "Writing and knowledge",
        explanation: "The source describes hieroglyphic writing and papyrus in Egypt, cuneiform in Mesopotamia, and writing systems in India and China. Writing can preserve records and ideas, but surviving texts represent particular people, purposes, and moments. They should be read with attention to who could write and whose experiences may be missing.",
        subtopics: [
          { title: "Record keeping", explanation: "Written systems can support communication and record keeping, although literacy and access may not have been evenly distributed." },
          { title: "Interpretation", explanation: "A reader must interpret symbols and language within their historical setting rather than assume modern meanings." },
        ],
      },
    ],
    definitions: [
      { term: "Material evidence", definition: "Physical objects, structures, or remains used to investigate the past." },
      { term: "Inscription", definition: "Words or symbols written, carved, or marked on a surface." },
      { term: "Context", definition: "The historical circumstances that help explain an object's or text's origin and meaning." },
    ],
    examples: [
      { title: "A building as a question, not an answer", explanation: "A pyramid can prompt questions about materials, construction, labor, and funerary practices. Each answer should be supported by relevant evidence rather than inferred from the building's size alone." },
      { title: "Compare writing systems", explanation: "The cited pages identify different writing systems in Egypt, Mesopotamia, and China. A useful comparison records the source's name for each system and asks what additional evidence is needed to understand how it was used." },
    ],
    exercises: [
      { prompt: "Choose one material object or structure from the lesson. Write one question it can help a historian investigate and one question it cannot answer by itself.", answer: "Example: A pyramid can help investigate construction materials and labor organization; by itself it cannot establish every belief held by all Egyptians.", explanation: "Material evidence is informative but limited; interpretation needs corroboration and context." },
      { prompt: "Why can a written record leave some experiences out?", answer: "It may have been created by a limited group for a particular purpose, and not everyone had equal access to writing.", explanation: "Sources reflect their creators and conditions of preservation." },
    ],
    summary: "Material and written evidence reveals important aspects of production, communication, and social organization. Good interpretation combines evidence, asks questions about context, and avoids treating one object or text as a complete account of an entire culture.",
    revisionQuestions: [
      { question: "Give one example of material evidence and one example of written evidence from the cited textbook.", answer: "Examples include a pyramid or metal tools; hieroglyphic or cuneiform writing.", explanation: "The source discusses both physical remains and writing systems." },
      { question: "Why should a historian not infer a whole culture from one artifact?", answer: "One artifact has limits and needs context and corroborating evidence.", explanation: "A single object cannot represent every group or experience in a society." },
    ],
    sources: [
      source("History Student Textbook, Grade 9, Unit 2: Ancient World Civilizations up to c. 500 AD", "0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf", 30, 35, { author: "Desta Roba Julla; Tesfaye Masebo Melko", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided textbook" }),
    ],
    relatedSlugs: ["ancient-civilizations", "notable-historical-figures"],
  },
  {
    slug: "human-environment-interaction",
    categorySlug: "environment-climate",
    title: "Human-environment interdependence",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "People depend on land, water, air, and living things, and human activity can change those natural systems. The Grade 10 Geography Teacher Guide describes human-environment interaction as a relationship that works in both directions: environments affect human activities, while communities and institutions influence the environment. This lesson uses that framework without presenting the guide as a current environmental assessment.",
    objectives: [
      "Explain the two-way relationship between people and the natural environment.",
      "Identify examples of human modification and environmental effects.",
      "Use a cause-and-effect chain to discuss adaptation and resource pressure.",
    ],
    topics: [
      {
        title: "Dependence and modification",
        explanation: "Human activities depend directly or indirectly on natural components such as land, water, air, and living things. Buildings, roads, parks, and industries can modify environmental conditions. The guide stresses interdependence: the environment is not only a backdrop but also a system that can constrain or support human activities.",
        subtopics: [
          { title: "Natural components", explanation: "Land, water, air, and organisms support human and ecological processes." },
          { title: "Human-made components", explanation: "Infrastructure changes how people use places and can also affect natural systems." },
        ],
      },
      {
        title: "Population, resources, and adaptation",
        explanation: "The guide asks learners to examine how population patterns relate to natural resources and socioeconomic conditions. A responsible analysis distinguishes an observed change from its possible causes, considers local context, and asks who is affected. Adaptation refers to ways people adjust to environmental change; the best response depends on the problem and available evidence.",
        subtopics: [
          { title: "Cause and effect", explanation: "A change in resource use may affect soils, vegetation, or water, while environmental conditions also shape livelihoods." },
          { title: "Local evidence", explanation: "A local example should be documented with place, time, and observations instead of being treated as a universal rule." },
        ],
      },
    ],
    definitions: [
      { term: "Human-environment interaction", definition: "The relationship in which people and natural systems influence one another." },
      { term: "Adaptation", definition: "A response or adjustment to changing conditions; in environmental learning, the specific response should be tied to evidence and context." },
      { term: "Natural resource", definition: "A part of the environment that people use or depend on." },
    ],
    examples: [
      { title: "A road through a community", explanation: "A road may improve access between places while also changing land use and affecting nearby habitats or water flow. A complete analysis records both benefits and possible effects." },
      { title: "A resource-use chain", explanation: "Map how a community uses water, what activities depend on it, and what changes could reduce availability. Add the evidence needed to test each link in the chain." },
    ],
    exercises: [
      { prompt: "Give one example of people affecting the environment and one example of the environment affecting people.", answer: "Example: clearing vegetation changes land cover; rainfall or terrain can affect farming and transport.", explanation: "The concept is two-way, so the answer should include both directions." },
      { prompt: "Why should an environmental claim include place and time?", answer: "Environmental conditions vary, and a claim may be true in one place or period but not another.", explanation: "Context helps avoid overgeneralizing." },
    ],
    summary: "People and natural systems are interdependent. Human activity can modify environments, while environmental conditions influence livelihoods and infrastructure. Analyses should include both directions, local evidence, and the limits of the available source.",
    revisionQuestions: [
      { question: "What is one difference between people affecting the environment and the environment affecting people?", answer: "The first describes human actions changing natural conditions; the second describes how environmental conditions influence human activity.", explanation: "The lesson treats the relationship as two-way." },
      { question: "Why should a local environmental claim include a place and time?", answer: "Because environmental conditions vary by location and period.", explanation: "Context prevents a local observation from being presented as a universal rule." },
    ],
    sources: [
      source("Geography Teacher Guide, Grade 10, human–natural environment interaction", "0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf", 27, 27, { author: "Wondafrash Genet Degu; Kenate Worku Tabor", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided teacher guide", note: "Teacher-guide reference, not a student textbook." }),
      source("Geography Teacher Guide, Grade 10, Unit 6 learning outcomes", "0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf", 210, 210, { author: "Wondafrash Genet Degu; Kenate Worku Tabor", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided teacher guide" }),
    ],
    relatedSlugs: ["african-climate", "natural-resources-livelihoods"],
  },
  {
    slug: "natural-resources-livelihoods",
    categorySlug: "agriculture-engineering",
    title: "Natural resources, livelihoods, and careful use",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Natural resources support life and human activity, but their presence alone does not guarantee that communities benefit from them. The Grade 10 Geography Teacher Guide identifies water, soils, minerals, vegetation, and wildlife among the resource topics it covers and emphasizes wise, sustainable use. The guide is the source for this introductory lesson; it does not provide a country-by-country resource inventory here.",
    objectives: [
      "Define natural resource in the context used by the cited guide.",
      "Group examples of resources into living and non-living categories.",
      "Explain why sustainable use matters alongside resource availability.",
    ],
    topics: [
      {
        title: "Types of natural resources",
        explanation: "The guide treats natural resources as parts of the environment that people use and examines drainage and water, soils, minerals, vegetation, and wildlife. These resources support different activities and ecosystems. A resource can have direct uses, such as water for household needs, and broader public value through ecosystem functions.",
        subtopics: [
          { title: "Living resources", explanation: "Vegetation and wildlife are living components whose condition depends on habitats and ecological relationships." },
          { title: "Land, water, and minerals", explanation: "These non-living components support agriculture, settlement, industry, and other activities, but their uses can compete." },
        ],
      },
      {
        title: "Resource use and sustainability",
        explanation: "The guide emphasizes that wise and sustainable use is important, not merely the existence of a resource. A useful study asks who uses the resource, how use affects its quantity or condition, and what evidence would show whether the use can continue. This is a planning framework, not a specific engineering design.",
        subtopics: [
          { title: "Trade-offs", explanation: "A use that benefits one activity may affect another user or ecosystem; record the benefit and the cost rather than reporting only one side." },
          { title: "Stewardship", explanation: "Monitoring, conservation, and careful management can help maintain the resource base for future use." },
        ],
      },
    ],
    definitions: [
      { term: "Natural resource", definition: "A part of the environment that people can use or that provides life-supporting services." },
      { term: "Sustainable use", definition: "Using and managing a resource in a way intended to maintain its condition and availability over time." },
      { term: "Livelihood", definition: "The means by which people support their lives, including the activities and resources they depend on." },
    ],
    examples: [
      { title: "A watershed resource map", explanation: "Mark a river, farms, settlements, vegetation, and other users on a local map. Ask which activities depend on the water and what observations would help assess whether use is changing." },
      { title: "Resource trade-off", explanation: "If land is used for a new activity, list possible benefits, affected users, and possible effects on soil or vegetation. Treat each effect as a question to investigate rather than an assumed outcome." },
    ],
    exercises: [
      { prompt: "Name two resources in the cited guide and one way each can support people or ecosystems.", answer: "Examples: water supports domestic and agricultural activities; vegetation provides habitat and materials. Learners should state the use carefully and locally.", explanation: "A resource's function depends on place and context." },
      { prompt: "Why does the guide emphasize sustainable use rather than only the presence of resources?", answer: "Because resource availability does not guarantee long-term benefit; how a resource is used and managed matters.", explanation: "Resource conditions and competing uses can change over time." },
    ],
    summary: "Water, soils, minerals, vegetation, and wildlife are among the natural-resource topics in the cited guide. Resource use connects to livelihoods and ecosystems. Careful planning considers benefits, trade-offs, local evidence, and sustainability.",
    revisionQuestions: [
      { question: "What is one difference between resource availability and sustainable use?", answer: "Availability describes whether a resource exists; sustainable use concerns how it is managed over time.", explanation: "Presence alone does not establish long-term condition or access." },
      { question: "Give one question to ask when studying a local resource.", answer: "Who uses it, what changes are observed, or how does its use affect other people or ecosystems?", explanation: "These questions connect resource mapping to evidence and stewardship." },
    ],
    sources: [
      source("Geography Teacher Guide, Grade 10, Unit 3: Natural Resource Base of Africa", "0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf", 74, 74, { author: "Wondafrash Genet Degu; Kenate Worku Tabor", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided teacher guide", note: "Teacher-guide reference, not a student textbook." }),
      source("Geography Teacher Guide, Grade 10, Unit 3 outcomes", "0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf", 207, 207, { author: "Wondafrash Genet Degu; Kenate Worku Tabor", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided teacher guide" }),
    ],
    relatedSlugs: ["human-environment-interaction", "african-climate"],
  },
  {
    slug: "relations-and-functions",
    categorySlug: "mathematics-logical-reasoning",
    title: "Relations, functions, domain, and range",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "A relation pairs inputs with outputs. A function is a special relation in which each allowed input has exactly one output. Describing a function means identifying its domain (the allowed inputs) and range (the outputs it actually produces). These ideas are useful in mathematics because they make rules and constraints explicit.",
    objectives: [
      "Identify the domain and range of a finite set of ordered pairs.",
      "Explain why a function assigns one output to each input.",
      "Find the domain and range of a simple linear function over the real numbers.",
    ],
    topics: [
      {
        title: "Relations as ordered pairs",
        explanation: "An ordered pair (x, y) records an input x and a related output y. For a finite relation, the domain is the set of first coordinates and the range is the set of second coordinates. Repeated values are listed once when forming a set.",
        subtopics: [
          { title: "Domain", explanation: "The domain is the collection of input values represented or allowed by the relation." },
          { title: "Range", explanation: "The range is the collection of output values that the relation actually produces." },
        ],
      },
      {
        title: "Functions and rules",
        explanation: "A function must give one and only one output for every input in its domain. A rule such as f(x)=3x+4 is defined for all real x; because any real output y can be written as y=3x+4 by choosing x=(y−4)/3, its range is also all real numbers. A different rule may have restrictions, so the domain and range must be checked for that rule.",
        subtopics: [
          { title: "Function test", explanation: "If the same input is assigned two different outputs, the relation is not a function." },
          { title: "State the allowed set", explanation: "A domain depends on the rule and on the set of inputs specified by the question." },
        ],
      },
    ],
    definitions: [
      { term: "Relation", definition: "A set of ordered pairs that connects elements from one set with elements from another." },
      { term: "Function", definition: "A relation that assigns exactly one output to each input in its domain." },
      { term: "Domain", definition: "The set of input values for which a relation or function is defined." },
      { term: "Range", definition: "The set of output values produced by a relation or function." },
    ],
    examples: [
      { title: "Finite relation", explanation: "For {(3,−2),(5,4),(1,2),(−3,7)}, the domain is {−3,1,3,5} and the range is {−2,2,4,7}. The order of the values inside each ordered pair matters." },
      { title: "Linear rule", explanation: "For f(x)=3x+4 over the real numbers, the domain is all real numbers. Given any real y, solve x=(y−4)/3; that real input produces y, so the range is all real numbers." },
    ],
    exercises: [
      { prompt: "Find the domain and range of {(2,−1),(0,0),(−4,2),(−5,3)}.", answer: "Domain {−5,−4,0,2}; range {−1,0,2,3}.", explanation: "Collect first coordinates for the domain and second coordinates for the range, listing each value once." },
      { prompt: "Is {(1,2),(1,3),(2,4)} a function? Explain.", answer: "No. Input 1 is assigned both 2 and 3.", explanation: "A function must assign exactly one output to each input." },
    ],
    summary: "Relations connect inputs and outputs through ordered pairs. The domain lists allowed inputs; the range lists outputs actually produced. A function is a relation with exactly one output per input, and its domain and range depend on the specified rule.",
    revisionQuestions: [
      { question: "What part of an ordered pair contributes to the domain?", answer: "The first coordinate.", explanation: "The first coordinate is the input." },
      { question: "What condition must a relation meet to be a function?", answer: "Every input in the domain must have exactly one output.", explanation: "An input cannot be paired with two different outputs in a function." },
    ],
    sources: [
      source("Mathematics Student Textbook, Grade 10, Unit 1: Relations and Functions", "0_Mathematics_Grade_10_ST_(MT)(BOOK)_1794579782721.pdf", 22, 32, { publisher: ministry, sourceKind: "user-provided textbook", note: "Local PDF page numbers; source metadata did not identify an author or publication year." }),
    ],
    relatedSlugs: ["scientific-method", "evaluate-historical-evidence"],
  },
  {
    slug: "notable-historical-figures",
    categorySlug: "famous-people-achievements",
    title: "Historical figures in their source context",
    language: "en",
    languageReviewStatus: "not_applicable",
    introduction: "Biographies are strongest when they connect a person's actions to the time and institutions around them. The Grade 9 History textbook names figures such as Cyrus, Confucius, and Ezana while discussing ancient political and cultural developments. This short lesson reports only the textbook's claims and shows how to keep a person's achievement connected to evidence rather than turning it into an unsupported legend.",
    objectives: [
      "Identify the historical context attached to a named figure in the source.",
      "Distinguish a sourced claim about a person from a broader unsourced biography.",
      "Ask what additional evidence would strengthen a biographical claim.",
    ],
    topics: [
      {
        title: "People and institutions",
        explanation: "The textbook connects Cyrus with the founding of a Persian Empire and describes contributions it associates with roads and a postal system. It presents Confucius as an influential philosopher whose teaching was Confucianism. These statements are source summaries; a full biography would require additional primary and scholarly references.",
        subtopics: [
          { title: "Cyrus in the cited account", explanation: "The textbook places Cyrus in the context of the first Persian Empire and identifies him with its founding around 550 BCE." },
          { title: "Confucius in the cited account", explanation: "The text gives Confucius's dates as 551–479 BCE and connects his teaching with Confucianism." },
        ],
      },
      {
        title: "Achievements and evidence",
        explanation: "The textbook also states that the Aksumite king Ezana invaded and destroyed Meroe around 350 CE. A careful reader records the exact claim and its page, then asks which additional sources could corroborate chronology, causes, and consequences. Naming a ruler is not the same as explaining all social change during that period.",
        subtopics: [
          { title: "Attribute claims", explanation: "Use wording such as 'the cited textbook reports' when a claim comes from one reference and has not been independently checked." },
          { title: "Avoid single-person explanations", explanation: "Historical change usually involves multiple people, institutions, and circumstances; one biography rarely explains an entire society." },
        ],
      },
    ],
    definitions: [
      { term: "Historical context", definition: "The circumstances, institutions, and period that help explain a person's actions." },
      { term: "Attribution", definition: "Clearly identifying which source supports a statement." },
      { term: "Corroboration", definition: "Checking a claim against additional evidence or independent sources." },
    ],
    examples: [
      { title: "Write a careful sentence", explanation: "Instead of writing 'Cyrus invented the postal service,' write 'The cited Grade 9 History textbook associates Cyrus's empire with the development of a postal service.' The second sentence accurately attributes what the source reports without overstating it." },
      { title: "Ask a follow-up question", explanation: "For a claim about Ezana and Meroe, ask which independent historical or archaeological sources support the date and what evidence describes the event's causes and consequences." },
    ],
    exercises: [
      { prompt: "Rewrite this sentence carefully: 'Confucius created every idea in Confucianism.'", answer: "Example: 'The cited textbook identifies Confucius as an influential philosopher and connects his teaching with Confucianism.'", explanation: "The revised sentence stays within the source's stated claim and avoids an unsupported absolute." },
      { prompt: "Name one kind of additional evidence that could corroborate a claim about a ruler.", answer: "A contemporary inscription, chronicle, archaeological evidence, or an independent scholarly account.", explanation: "Corroboration checks a claim from more than one evidence source." },
    ],
    summary: "Historical figures should be studied in context. This source names Cyrus, Confucius, and Ezana in connection with broader developments, but its brief claims are not full biographies. Attribute statements, record page references, and seek corroborating evidence before making stronger claims.",
    revisionQuestions: [
      { question: "Why does this lesson say 'the textbook reports' rather than present every statement as independently verified fact?", answer: "The content is based on one identified source and has not been independently cross-checked.", explanation: "Attribution makes the evidence boundary clear." },
      { question: "Why should achievements be connected to institutions and context?", answer: "Because historical change involves broader conditions and not only one person's actions.", explanation: "Context helps avoid oversimplifying complex developments." },
    ],
    sources: [
      source("History Student Textbook, Grade 9, Unit 2: Ancient World Civilizations up to c. 500 AD", "0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf", 32, 35, { author: "Desta Roba Julla; Tesfaye Masebo Melko", publisher: ministry, publicationDate: "2022", sourceKind: "user-provided textbook" }),
    ],
    relatedSlugs: ["ancient-civilizations", "culture-through-material-evidence"],
  },
];
