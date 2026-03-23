PLANNER_PROMPT = """Generate exactly 2 distinct search queries for comprehensive coverage of the topic.

Topic: {topic}

Return ONLY a JSON array: ["query one", "query two"]"""

SUMMARISER_PROMPT = """Extract key facts relevant to the topic from each source. Write 2-3 sentences per source. Be factual and specific.

Topic: {topic}

Sources:
<sources>
{sources}
</sources>

Return one summary per source, prefixed with the source number (e.g. "1. ..."). No preamble."""

OUTLINER_PROMPT = """Create a structured article outline based on the research summaries. Assign sources to each section.

Topic: {topic}

Research summaries:
<summaries>
{summaries}
</summaries>

Return a markdown outline with:
- A proposed article title
- 3-4 section headings (H2) with 2-3 bullet points each describing what to cover
- For each section, note which source numbers to cite (e.g. [1, 3])
- A brief note on the conclusion angle

Keep it concise — this is a plan, not a draft."""

DRAFTER_PROMPT = """Write a well-structured, insightful article on the topic. Follow the outline structure and use the research summaries for content.

Topic: {topic}

Outline:
<outline>
{outline}
</outline>

Research summaries:
<summaries>
{summaries}
</summaries>

Follow the outline's section plan and source assignments. Write with H1 title, executive summary, H2 sections, conclusion, and a Sources section with URLs. Cite sources inline. Professional level."""

DRAFTER_REVISION_PROMPT = """Revise the draft based on editorial feedback.{new_research_section}

Topic: {topic}

Previous draft:
<draft>
{previous_draft}
</draft>

Feedback:
<feedback>
{critique}
</feedback>

Maintain structure (H1, summary, 3-4 H2 sections, conclusion, Sources). Focus on the specific issues raised. Cite sources inline."""

REFLECTION_PROMPT = """Critique this research draft. Iteration {iteration} of {max_iterations}.

Topic: {topic}

Draft:
<draft>
{draft}
</draft>

Evaluate: coverage, evidence, structure, accuracy.

Return ONLY JSON:
{{"action": "accept|revise|research", "critique": "specific feedback", "gaps": ["search query"]}}

- "accept": draft is strong, no changes needed.
- "revise": writing issues fixable without new research.
- "research": content gaps requiring web search. Include "gaps" with 1-2 queries.
- If iteration >= {max_iterations}, MUST use "accept".

Be specific — point to exact sections or claims."""

JUDGE_PROMPT = """Score this research draft on three dimensions (1.0-5.0) and classify evidence strength:
- quality: clear, well-structured, insightful?
- relevance: thoroughly addresses the topic?
- groundedness: claims supported by sources?
- evidence_strength: classify as "high", "medium", or "low"
  - high: multiple high-quality sources, consistent findings
  - medium: some supporting evidence, minor gaps
  - low: weak, sparse, or conflicting evidence

Topic: {topic}

Draft:
<draft>
{draft}
</draft>

Sources: {sources}

Return ONLY JSON: {{"quality": 4.2, "relevance": 3.8, "groundedness": 4.5, "evidence_strength": "high"}}"""
