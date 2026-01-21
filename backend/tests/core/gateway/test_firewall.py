"""Unit tests for gateway firewall: check_firewall (Phase 4, Task 4.2b)."""

from unittest.mock import patch

from sqlmodel import Session

from app.core.gateway.firewall import check_firewall
from app.models_dbapi import FirewallRuleTypeEnum, FirewallRules


def _add_rule(
    db: Session,
    *,
    rule_type: FirewallRuleTypeEnum,
    ip_range: str,
    is_active: bool = True,
    sort_order: int = 0,
) -> FirewallRules:
    r = FirewallRules(
        rule_type=rule_type,
        ip_range=ip_range,
        is_active=is_active,
        sort_order=sort_order,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# Use sort_order < 0 so our rules are evaluated before any DENY 0.0.0.0/0
# that api/routes/test_firewall may have created (which would match all IPv4).
_SORT_FIRST = -1000


def test_check_firewall_allow_rule(db: Session) -> None:
    """ALLOW rule matching IP returns True."""
    _add_rule(
        db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="203.0.113.0/24", sort_order=_SORT_FIRST
    )
    assert check_firewall("203.0.113.50", db) is True
    assert check_firewall("203.0.113.1", db) is True


def test_check_firewall_deny_rule(db: Session) -> None:
    """DENY rule matching IP returns False."""
    _add_rule(
        db, rule_type=FirewallRuleTypeEnum.DENY, ip_range="198.51.100.0/24", sort_order=_SORT_FIRST
    )
    assert check_firewall("198.51.100.10", db) is False
    assert check_firewall("198.51.100.1", db) is False


def test_check_firewall_deny_takes_precedence_when_first(db: Session) -> None:
    """When DENY has lower sort_order than ALLOW and both match, DENY wins."""
    _add_rule(db, rule_type=FirewallRuleTypeEnum.DENY, ip_range="203.0.113.1/32", sort_order=-1001)
    _add_rule(db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="203.0.113.0/24", sort_order=-1000)
    assert check_firewall("203.0.113.1", db) is False


def test_check_firewall_allow_wins_when_deny_does_not_match(db: Session) -> None:
    """ALLOW can match when DENY exists for a different range."""
    _add_rule(db, rule_type=FirewallRuleTypeEnum.DENY, ip_range="198.51.100.0/24", sort_order=-1001)
    _add_rule(db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="203.0.113.0/24", sort_order=-1000)
    assert check_firewall("203.0.113.5", db) is True
    assert check_firewall("198.51.100.5", db) is False


def test_check_firewall_single_ip_as_range(db: Session) -> None:
    """ip_range as single IP (e.g. 10.0.0.1) is treated as /32."""
    _add_rule(db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="10.0.0.1", sort_order=_SORT_FIRST)
    assert check_firewall("10.0.0.1", db) is True


def test_check_firewall_no_match_uses_default(db: Session) -> None:
    """IP not matching any rule returns GATEWAY_FIREWALL_DEFAULT_ALLOW (default True)."""
    _add_rule(db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="203.0.113.0/24", sort_order=_SORT_FIRST)
    # Use IPv6: 0.0.0.0/0 (from other tests) does not match IPv6, so we truly have no match.
    with patch("app.core.gateway.firewall.settings") as m:
        m.GATEWAY_FIREWALL_DEFAULT_ALLOW = True
        assert check_firewall("2001:db8::2", db) is True
        m.GATEWAY_FIREWALL_DEFAULT_ALLOW = False
        assert check_firewall("2001:db8::3", db) is False


def test_check_firewall_inactive_rule_ignored(db: Session) -> None:
    """Rules with is_active=False are ignored."""
    _add_rule(
        db,
        rule_type=FirewallRuleTypeEnum.DENY,
        ip_range="203.0.113.0/24",
        is_active=False,
        sort_order=_SORT_FIRST,
    )
    # Would be denied if active; inactive is filtered out. Use IPv6 so 0.0.0.0/0 doesn't match.
    with patch("app.core.gateway.firewall.settings") as m:
        m.GATEWAY_FIREWALL_DEFAULT_ALLOW = True
        assert check_firewall("2001:db8::1", db) is True


def test_check_firewall_invalid_ip_denied(db: Session) -> None:
    """Unparseable or empty IP returns False."""
    assert check_firewall("", db) is False
    assert check_firewall("not-an-ip", db) is False
    assert check_firewall("256.1.1.1", db) is False


def test_check_firewall_ipv6(db: Session) -> None:
    """IPv6 CIDR and address work."""
    _add_rule(
        db, rule_type=FirewallRuleTypeEnum.ALLOW, ip_range="2001:db8::/32", sort_order=_SORT_FIRST
    )
    assert check_firewall("2001:db8::1", db) is True
    assert check_firewall("2001:db8:1::1", db) is True
