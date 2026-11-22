export function materialFixtures() {
  const base=(id,type,extra)=>({id,topicId:"technical-test",topicTitle:"Technical regression fixture",type,title:`Fixture: ${type}`,...extra});
  return [
    base("notes","notes",{text:"Complete technical test paragraph. ".repeat(1100)+"END-OF-ALL-NOTES",sourceTitle:"Technical source fixture",sourceFile:"fixtures/source.pdf",sourceLabel:"Technical source section",sourceAuthor:"Test author",sourcePublisher:"Test publisher",sourcePublicationDate:"2026",sourceEdition:"Test edition",sourcePages:"pp. 1–2"}),
    base("subtopic","subtopic",{text:"A complete subtopic explanation.",items:[{detail:"Nested information must remain readable."}]}),
    base("definition","definition",{term:"Regression fixture",definition:"Synthetic test data that is never published to students."}),
    base("concept","concept",{text:"Verify that stored content and displayed content agree."}),
    base("objective","objective",{items:["Identify the fixture's purpose.","Explain how the test checks it."]}),
    base("example","example",{text:"A worked technical example.",steps:["Read all inputs.","Preserve every output."]}),
    base("formula","formula",{expression:"A = πr²",explanation:"The complete expression is preserved as text."}),
    base("diagram","diagram",{url:"/images/mina-teach-ai-favicon.png",alt:"Existing application image used only for a technical image-loading check.",caption:"Image fixture, not a textbook diagram."}),
    base("table","table",{headers:["Input","Output"],rows:[["first","preserved"],["last","ALSO-PRESERVED"]],caption:"Complete table fixture"}),
    base("activity","activity",{text:"Compare every value.",steps:["Read first value.","Check final value."]}),
    base("exercise","exercise",{question:"How many choices belong to one MCQ?",answer:"Four.",explanation:"The validator checks exactly four choices."}),
    base("review","review",{question:"May an incomplete source be marked complete?",answer:"No.",explanation:"Missing material must remain identified as missing."}),
    base("summary","summary",{text:"All fixture material must remain available without truncation."}),
    base("mcq","mcq",{question:"Which response describes complete retrieval?",choices:["Only the title","All registered material","Only a summary","No content"],correctIndex:1,explanation:"Every stored material section must be accessible."}),
    base("resource","resource",{url:"https://anrseb.gov.et/",text:"Reference-link fixture; external availability is not asserted."}),
    base("timeline","timeline",{events:[{date:"First",description:"Start of fixture."},{date:"Last",description:"END-OF-TIMELINE"}]}),
  ];
}
