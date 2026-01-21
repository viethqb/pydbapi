"""Test helpers for FirewallRules."""

import random

from sqlmodel import Session

from app.models_dbapi import FirewallRules, FirewallRuleTypeEnum


def create_random_firewall_rule(
    db: Session,
    *,
    rule_type: FirewallRuleTypeEnum = FirewallRuleTypeEnum.ALLOW,
    ip_range: str | None = None,
    description: str | None = None,
    is_active: bool = True,
    sort_order: int = 0,
) -> FirewallRules:
    """Create a FirewallRules in the DB."""
    r = FirewallRules(
        rule_type=rule_type,
        ip_range=ip_range or f"192.168.1.{random.randint(1, 254)}/32",
        description=description,
        is_active=is_active,
        sort_order=sort_order,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
