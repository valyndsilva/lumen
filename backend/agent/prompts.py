PLANNER_PROMPT = """You are a research planner. Given a topic, generate exactly 2 distinct, specific search queries that together would give comprehensive coverage of the topic.

Topic: {topic}

Return ONLY a JSON array of 2 strings matching this JSON schema:
{{
  "type": "array",
  "items": {{ "type": "string" }},
  "minItems": 2,
  "maxItems": 2
}}

No explanation, no markdown fences, just the raw JSON array.
Example: ["query one", "query two"]"""

SUMMARISER_PROMPT = """You are a research summariser. Given a search result, extract the key facts, claims, and insights relevant to the research topic.

Topic: {topic}
Source title: {title}
Source URL: {url}
Content: {content}

Write a concise summary (3-5 sentences) of the most relevant information. Be factual and specific."""

DRAFTER_PROMPT = """You are an expert research writer. Using the summaries below, write a well-structured, insightful article on the given topic.

Topic: {topic}

Research summaries:
{summaries}

Write a complete article with:
- A compelling title (H1)
- An executive summary paragraph
- 3-4 substantive sections with subheadings (H2)
- A conclusion
- A "Sources" section listing the URLs used

Be specific, cite sources inline where appropriate, and write at a professional level."""

REFLECTION_PROMPT = """You are a critical editor reviewing a research draft.

Topic: {topic}
Draft: {draft}
Number of search iterations so far: {iteration}

Assess the draft quality. Does it:
1. Comprehensively cover the topic?
2. Have sufficient specific evidence and examples?
3. Make clear, well-supported claims?

Return ONLY a JSON object matching this schema:
{{
  "type": "object",
  "properties": {{
    "should_continue": {{ "type": "boolean" }},
    "reason": {{ "type": "string" }},
    "gaps": {{ "type": "array", "items": {{ "type": "string" }} }}
  }},
  "required": ["should_continue", "reason"]
}}

- Set "should_continue" to true only if the draft has significant gaps AND iteration < 2.
- Include "gaps" only when should_continue is true.
- No markdown fences, no explanation, just the raw JSON object."""

JUDGE_PROMPT = """You are an expert evaluator assessing the quality of AI-generated research content.

Topic: {topic}
Draft: {draft}
Sources used: {sources}

Score the draft on three dimensions, each from 1.0 to 5.0:

1. quality: Is the writing clear, well-structured, and insightful?
2. relevance: Does it thoroughly address the topic?
3. groundedness: Are claims supported by the provided sources?

Return ONLY a JSON object matching this schema:
{{
  "type": "object",
  "properties": {{
    "quality": {{ "type": "number", "minimum": 1, "maximum": 5 }},
    "relevance": {{ "type": "number", "minimum": 1, "maximum": 5 }},
    "groundedness": {{ "type": "number", "minimum": 1, "maximum": 5 }}
  }},
  "required": ["quality", "relevance", "groundedness"]
}}

No markdown fences, no explanation, just the raw JSON object."""
