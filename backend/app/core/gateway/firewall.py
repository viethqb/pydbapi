"""
Gateway IP firewall - disabled (firewall feature removed).

Always allows all IPs.
"""

from sqlmodel import Session


def check_firewall(ip: str, session: Session) -> bool:
    """
    Firewall check - always allows all IPs (firewall feature removed).
    
    Returns True to allow all requests.
    """
    return True
