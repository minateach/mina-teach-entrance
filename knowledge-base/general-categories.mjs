export const generalKnowledgeCategories = [
  { slug: "science-discoveries", title: "Science and discoveries", description: "Scientific questions, evidence, and discoveries." },
  { slug: "world-history", title: "World history", description: "Societies and events studied through historical evidence." },
  { slug: "geography-countries", title: "Geography and countries", description: "Places, patterns, people, and geographic information." },
  { slug: "technology-ai", title: "Technology and artificial intelligence", description: "Technology concepts and responsible AI learning." },
  { slug: "health-human-biology", title: "Health and human biology", description: "Educational explanations of the human body and health." },
  { slug: "business-entrepreneurship", title: "Business and entrepreneurship", description: "Business ideas, enterprise, and practical planning." },
  { slug: "economics-finance", title: "Economics and finance education", description: "Economic ideas and financial literacy." },
  { slug: "politics-government", title: "Politics and government", description: "Neutral explanations of political institutions and public life." },
  { slug: "religion-world-beliefs", title: "Religion and world beliefs", description: "Respectful, balanced learning about traditions and beliefs." },
  { slug: "philosophy-critical-thinking", title: "Philosophy and critical thinking", description: "Reasoning, evaluating claims, and comparing ideas." },
  { slug: "culture-civilization", title: "Culture and civilization", description: "Human societies, cultural expression, and material evidence." },
  { slug: "environment-climate", title: "Environment and climate", description: "Environmental systems and human-environment relationships." },
  { slug: "space-astronomy", title: "Space and astronomy", description: "Astronomical ideas and exploration of space." },
  { slug: "famous-people-achievements", title: "Famous people and achievements", description: "People and achievements studied with source context." },
  { slug: "sports-events", title: "Sports and international events", description: "Sports, institutions, and international events." },
  { slug: "languages-linguistics", title: "Languages and linguistics", description: "Language structure, use, and linguistic diversity." },
  { slug: "agriculture-engineering", title: "Agriculture and engineering", description: "Agricultural systems, natural resources, and engineering." },
  { slug: "mathematics-logical-reasoning", title: "Mathematics and logical reasoning", description: "Mathematical ideas and structured problem solving." },
  { slug: "current-world-knowledge", title: "Current world knowledge", description: "Time-sensitive knowledge requires current, reviewed sources." },
  { slug: "everyday-life-skills", title: "Everyday life skills", description: "Practical skills for learning and daily decisions." },
];

export function generalKnowledgeCategory(slug) {
  return generalKnowledgeCategories.find(category => category.slug === slug) || null;
}
