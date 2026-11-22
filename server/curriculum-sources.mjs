const primarySubjects = [
  "Mathematics", "Physics", "Chemistry", "Biology", "English",
  "Geography", "History", "Economics", "Civics and Ethics",
];

const missing = {
  status: "source_required",
  statusLabel: "Grade-specific textbook or syllabus not registered",
  source: null,
  units: [],
  lessonLanguageNote: "No textbook-mapped lesson version is registered; assessment-only material is not a substitute for a curriculum map.",
  note: "Some uploaded exams or general materials may exist, but they do not establish the course chapters. Do not infer titles or mark this course complete until a traceable grade-specific textbook or syllabus is available.",
};

const mappings = {
  "9:Mathematics": {
    status: "outline_only",
    statusLabel: "Uploaded textbook; table of contents extracted",
    source: {
      title: "Mathematics Student Textbook, Grade 9",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      publicationDate: null,
      pageCount: 324,
      file: "attached_assets/1_MathSBG9(1)_1794559179093.pdf",
    },
    units: [
      { number: 1, title: "The Number System", sections: [
        "1.1 Revision on the set of rational numbers",
        "1.2 The real number system",
        "1.2.1 Representation of rational numbers by decimals",
        "1.2.2 Irrational numbers",
        "1.2.3 Real numbers",
        "1.2.4 Exponents and radicals",
        "1.2.5 The four operations on real numbers",
        "1.2.6 Limits of accuracy",
        "1.2.7 Scientific notation (standard form)",
        "1.2.8 Rationalization",
        "1.2.9 Euclid's division algorithm",
      ], pageStart: 1 },
      { number: 2, title: "Solutions of Equations", sections: ["2.1 Equations involving exponents and radicals", "2.2 Systems of linear equations in two variables", "2.3 Equations involving absolute value", "2.4 Quadratic equations"], pageStart: 63 },
      { number: 3, title: "Further on Sets", sections: ["3.1 Ways to describe sets", "3.2 The notation of sets", "3.3 Operations on sets"], pageStart: 105 },
      { number: 4, title: "Relations and Functions", sections: ["4.1 Relations", "4.2 Functions", "4.3 Graphs of functions"], pageStart: 139 },
      { number: 5, title: "Geometry and Measurement", sections: ["5.1 Regular polygons", "5.2 Further on congruency and similarity", "5.3 Further on trigonometry", "5.4 Circles", "5.5 Measurement"], pageStart: 175 },
      { number: 6, title: "Statistics and Probability", sections: ["6.1 Statistical data", "6.2 Probability"], pageStart: 249 },
      { number: 7, title: "Vectors in Two Dimensions", sections: ["7.1 Introduction to vectors and scalars", "7.2 Representation of a vector", "7.3 Addition and subtraction of vectors and multiplication by a scalar", "7.4 Position vector of a point"], pageStart: 291 },
    ],
    lessonLanguageNote: "English source outline is available; no student-visible Grade 9 Mathematics lessons are registered.",
    note: "Chapter and section titles are transcribed from the uploaded textbook contents. This is an outline, not completed lesson coverage.",
  },
  "10:Mathematics": {
    status: "outline_only",
    statusLabel: "Uploaded textbook; table of contents extracted",
    source: {
      title: "Mathematics Student Textbook, Grade 10",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      publicationDate: null,
      pageCount: 373,
      file: "attached_assets/0_Mathematics_Grade_10_ST_(MT)(BOOK)_1794579782721.pdf",
    },
    units: [
      { number: 1, title: "Relations and Functions", sections: ["1.1 Relations", "1.2 Functions", "1.3 Applications of relations and functions"], pageStart: 1 },
      { number: 2, title: "Polynomial Functions", sections: ["2.1 Introduction of polynomial functions", "2.2 Operations on polynomial functions", "2.3 Theorem on polynomial functions", "2.4 Zeros of polynomial functions", "2.5 Graphs of polynomial functions", "2.6 Applications"], pageStart: 65 },
      { number: 3, title: "Exponential and Logarithmic Functions", sections: ["3.1 Exponents and logarithms", "3.2 Exponential functions and their graphs", "3.3 Logarithmic functions and their graphs", "3.4 Solving exponential and logarithmic equations", "3.5 Relation between exponential and logarithmic functions", "3.6 Applications"], pageStart: 116 },
      { number: 4, title: "Trigonometric Functions", sections: ["4.1 Radian measure of angle", "4.2 Basic trigonometric function", "4.3 Trigonometric identities and equations", "4.4 Application"], pageStart: 186 },
      { number: 5, title: "Circles", sections: ["5.1 Symmetrical properties of circles", "5.2 Angle properties of circles", "5.3 Arc length, perimeters and areas of segments and sectors", "5.4 Theorems on angles and arcs determined by intersecting lines"], pageStart: 237 },
      { number: 6, title: "Solid Figures", sections: ["6.1 Revision of cylinders and prisms", "6.2 Pyramids, cones and spheres", "6.3 Frustum of pyramids and cones", "6.4 Surface areas and volumes of composed solids", "6.5 Applications"], pageStart: 271 },
      { number: 7, title: "Coordinate Geometry", sections: ["7.1 Distance between two points", "7.2 Division of a line segment", "7.3 Equation of a line", "7.4 Slopes of parallel and perpendicular lines", "7.5 Applications"], pageStart: 327 },
    ],
    lessonLanguageNote: "English source outline is available; no student-visible Grade 10 Mathematics lessons are registered.",
    note: "Chapter and section titles are transcribed from the uploaded textbook contents. This is an outline, not completed lesson coverage.",
  },
  "9:Biology": {
    status: "outline_only",
    statusLabel: "Uploaded textbook; unit headings extracted",
    source: {
      title: "Biology Student Textbook, Grade 9",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      publicationDate: null,
      pageCount: 165,
      file: "attached_assets/2_Biology_Grade_9_Students_TextBook_Final_Revised_1794581171278.pdf",
    },
    units: [
      { number: 1, title: "Introduction to Biology", sections: ["1.1 Definition of Biology", "1.2 Why do we study Biology?", "1.3 The scientific method", "1.4 Tools of a Biologist", "1.5 Handling and using a light microscope", "1.6 General laboratory safety rules"], pageStart: 1 },
      { number: 2, title: "Characteristics and Classification of Organisms", pageStart: 19 },
      { number: 3, title: "Cells", pageStart: 44 },
      { number: 4, title: "Reproduction", pageStart: 74 },
      { number: 5, title: "Human Health, Nutrition and Diseases", pageStart: 103 },
      { number: 6, title: "Ecology", pageStart: 137 },
    ],
    lessonLanguageNote: "English source outline is available; no student-visible Grade 9 Biology lessons are registered.",
    note: "Unit headings and Unit 1 section headings are available from the uploaded textbook contents. Other unit topics still need page-by-page mapping.",
  },
  "9:History": {
    status: "outline_only",
    statusLabel: "Uploaded textbook; nine unit headings extracted",
    source: {
      title: "History Student Textbook, Grade 9",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      authors: ["Desta Roba Julla", "Tesfaye Masebo Melko"],
      publicationDate: "2022",
      pageCount: 217,
      file: "attached_assets/0_History_Grade_9_Student_TextBook_Final_Submission_(1)_1794580293723.pdf",
    },
    units: [
      { number: 1, title: "The Discipline of History and Human Evolution", pageStart: 1 },
      { number: 2, title: "Ancient World Civilizations up to c. 500 AD", pageStart: 22 },
      { number: 3, title: "Peoples and States in Ethiopia and the Horn to the End of the 13th Century", pageStart: 40 },
      { number: 4, title: "The Middle Ages and Early Modern World, c. 500 to 1750s", pageStart: 65 },
      { number: 5, title: "Peoples and States of Africa to 1500", pageStart: 84 },
      { number: 6, title: "Africa and the Outside World, 1500–1880s", pageStart: 104 },
      { number: 7, title: "States, Principalities, Population Movements and Interactions in Ethiopia, 13th to Mid-16th Century", pageStart: 120 },
      { number: 8, title: "Political, Social and Economic Processes in Ethiopia, Mid-16th to Mid-19th Century", pageStart: 155 },
      { number: 9, title: "The Age of Revolutions, 1750s to 1815", pageStart: 188 },
    ],
    lessonLanguageNote: "English source outline is available; no student-visible Grade 9 History lessons are registered.",
    note: "The nine unit headings are transcribed from the uploaded textbook contents. Topics and lesson content have not yet been fully mapped.",
  },
  "9:English": {
    status: "partial_lessons",
    statusLabel: "Official textbook reference linked; three units represented",
    source: {
      title: "English for Ethiopia Student Textbook, Grade 9",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      publicationDate: "July 2022",
      url: "https://learn-english.moe.gov.et/storage/English%20Textbook/15.%20English%20Grade%209%20TextbookFinal_June%2030.pdf",
    },
    units: [
      { number: 1, title: "Living in Urban Areas", pages: "1–32" },
      { number: 2, title: "Study Skills", pages: "32–59" },
      { number: 3, title: "Traffic Accident", pages: "60–82" },
    ],
    lessonLanguageNote: "English and Afaan Oromoo lesson records exist for these three units; Amharic records are not present. The Afaan Oromoo source labels still request language-review confirmation.",
    note: "Only the three units represented in the current lesson database are mapped here; this does not certify full Grade 9 English textbook coverage.",
  },
  "10:Geography": {
    status: "teacher_guide_only",
    statusLabel: "Teacher guide available; student textbook not registered",
    source: {
      title: "Geography Teacher Guide, Grade 10",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      authors: ["Wondafrash Genet Degu", "Kenate Worku Tabor"],
      publicationDate: "2022",
      pageCount: 214,
      file: "attached_assets/0_Geography_Grade_10_Teacher_Guide_Final_version.July.2022_1794579191591.pdf",
    },
    units: [
      { number: 1, title: "Landforms of Africa", pageStart: 1 },
      { number: 2, title: "Climate of Africa", pageStart: 15 },
      { number: 3, title: "Natural Resource Base of Africa", pageStart: 43 },
      { number: 4, title: "Population of Africa", pageStart: 65 },
      { number: 5, title: "Major Economic and Cultural Activities in Africa" },
      { number: 6, title: "Human-Natural Environment Interaction", pageStart: 117 },
      { number: 7, title: "Geographic Issues and Public Concerns in Africa" },
      { number: 8, title: "Geospatial Information and Data" },
    ],
    lessonLanguageNote: "An English teacher-guide outline is available; no student-visible Grade 10 Geography lessons are registered.",
    note: "This is a teacher guide, not the student textbook. It is useful as a curriculum reference but cannot be represented as a complete student-textbook mapping.",
  },
  "10:History": {
    status: "partial_lessons",
    statusLabel: "Textbook linked; Unit 1 lesson set only",
    source: {
      title: "History Student Textbook, Grade 10",
      publisher: "Federal Democratic Republic of Ethiopia, Ministry of Education",
      publicationDate: "2023",
      url: "https://anrseb.gov.et/wp-content/uploads/New_Text_Books/Grade10/G10-History-STB-2023-ANRSEB.pdf",
    },
    units: [
      { number: 1, title: "Development of Capitalism and Nationalism, 1815–1914", mappedLessonCount: 6 },
    ],
    lessonLanguageNote: "English lesson material exists for part of Unit 1 only; Afaan Oromoo and Amharic lesson versions are not present.",
    note: "Units 2–9 are not represented by the current lesson set. The linked source was not reachable through the available web-fetch service during this audit.",
  },
};

function normalizeSubject(subject) {
  return subject === "Civics" ? "Civics and Ethics" : subject;
}

function sourceSummary(mapping) {
  if (mapping.status === "source_required") return "No grade-specific textbook or syllabus source registered.";
  const unitCount = mapping.units.length;
  if (mapping.status === "outline_only") return `Textbook outline only · ${unitCount} units; lesson coverage incomplete.`;
  if (mapping.status === "teacher_guide_only") return `Teacher guide only · ${unitCount} units; student textbook not registered.`;
  if (mapping.status === "partial_lessons") return `Partial lesson mapping · ${unitCount} unit${unitCount === 1 ? "" : "s"} represented; course incomplete.`;
  return "Source mapping incomplete.";
}

export function curriculumSourceFor(grade, subject) {
  const mapping = mappings[`${Number(grade)}:${normalizeSubject(subject)}`] || missing;
  return {
    ...mapping,
    units: mapping.units.map(unit => ({...unit, sections: unit.sections ? [...unit.sections] : undefined})),
    source: mapping.source ? {...mapping.source, authors: mapping.source.authors ? [...mapping.source.authors] : undefined} : null,
    summary: sourceSummary(mapping),
    curriculumCompletenessVerified: false,
  };
}

export function allPrimaryCurriculumSources() {
  return [9, 10, 11, 12].flatMap(grade =>
    primarySubjects.map(subject => ({grade, subject, ...curriculumSourceFor(grade, subject)})),
  );
}
