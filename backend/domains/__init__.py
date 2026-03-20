import yaml
from pathlib import Path
from dataclasses import dataclass

DOMAINS_DIR = Path(__file__).parent


@dataclass
class DomainConfig:
    domain: str
    label: str
    search_provider: str
    planner_context: str
    summariser_context: str
    outliner_template: str
    reflection_rules: str
    judge_criteria: str


def load_domain(domain: str) -> DomainConfig:
    """Load a domain config from YAML. Falls back to 'general' if not found."""
    path = DOMAINS_DIR / f"{domain}.yaml"
    if not path.exists():
        path = DOMAINS_DIR / "general.yaml"

    with open(path) as f:
        raw = yaml.safe_load(f)

    return DomainConfig(
        domain=raw.get("domain", "general"),
        label=raw.get("label", "General Research"),
        search_provider=raw.get("search", {}).get("provider", "tavily"),
        planner_context=raw.get("planner", {}).get("context", ""),
        summariser_context=raw.get("summariser", {}).get("context", ""),
        outliner_template=raw.get("outliner", {}).get("template", ""),
        reflection_rules=raw.get("reflection", {}).get("rules", ""),
        judge_criteria=raw.get("judge", {}).get("criteria", ""),
    )


def list_domains() -> list[dict]:
    """List all available domains with their labels."""
    domains = []
    for path in sorted(DOMAINS_DIR.glob("*.yaml")):
        with open(path) as f:
            raw = yaml.safe_load(f)
        domains.append({
            "id": raw.get("domain", path.stem),
            "label": raw.get("label", path.stem),
        })
    return domains
