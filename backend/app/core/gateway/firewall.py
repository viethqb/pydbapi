"""
Gateway IP firewall (Phase 4, Task 4.2b): check_firewall.

Uses FirewallRules (allow/deny, ip_range as CIDR or single IP).
"""

import ipaddress

from sqlmodel import Session, select

from app.core.config import settings
from app.models_dbapi import FirewallRuleTypeEnum, FirewallRules


def _ip_in_range(ip_str: str, ip_range: str) -> bool:
    """
    Check if ip_str is inside ip_range (CIDR or single IP).
    Returns False if either is unparseable.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    try:
        net = ipaddress.ip_network(ip_range.strip(), strict=False)
    except ValueError:
        return False
    return ip in net


def check_firewall(ip: str, session: Session) -> bool:
    """
    Evaluate IP against FirewallRules. True = allow, False = deny (caller should return 403).

    - Unparseable ip → False (deny).
    - Load FirewallRules with is_active=True, order by sort_order, id.
    - For each rule: if ip in ip_range and rule_type==DENY → False; if ALLOW → True.
    - If no rule matches → GATEWAY_FIREWALL_DEFAULT_ALLOW.
    """
    if not ip or not isinstance(ip, str):
        return False
    ip = ip.strip()
    if not ip:
        return False

    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return False

    stmt = (
        select(FirewallRules)
        .where(FirewallRules.is_active.is_(True))
        .order_by(FirewallRules.sort_order.asc(), FirewallRules.id.asc())
    )
    rules = session.exec(stmt).all()

    for r in rules:
        if not _ip_in_range(ip, r.ip_range):
            continue
        if r.rule_type == FirewallRuleTypeEnum.DENY:
            return False
        if r.rule_type == FirewallRuleTypeEnum.ALLOW:
            return True

    return settings.GATEWAY_FIREWALL_DEFAULT_ALLOW
