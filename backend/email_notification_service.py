"""
Email Notification Service - Hierarchical email collection and sending
"""
from typing import List, Set
from sqlalchemy.orm import Session
from models import VideoAccount, Dealer, Group, Country


def get_notification_emails(
    db: Session,
    account_id: int,
    notification_type: str
) -> List[str]:
    """
    Get all email addresses for a given account and notification type.
    Cascades up through Account → Dealer → Group → Country hierarchy.

    Args:
        db: Database session
        account_id: VideoAccount ID
        notification_type: "vital_signs", "general", or "all"

    Returns:
        List of unique email addresses
    """
    emails: Set[str] = set()

    # Get the account
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        return []

    # Collect account-level emails
    if account.notification_emails:
        for email_obj in account.notification_emails:
            if email_obj.get('type') == 'all' or email_obj.get('type') == notification_type:
                emails.add(email_obj.get('email'))

    # Collect dealer-level emails if account has a dealer
    if account.dealer_id:
        dealer = db.query(Dealer).filter(Dealer.id == account.dealer_id).first()
        if dealer and dealer.notification_emails:
            for email_obj in dealer.notification_emails:
                if email_obj.get('type') == 'all' or email_obj.get('type') == notification_type:
                    emails.add(email_obj.get('email'))

            # Collect group-level emails if dealer has a group
            if dealer.group_id:
                group = db.query(Group).filter(Group.id == dealer.group_id).first()
                if group and group.notification_emails:
                    for email_obj in group.notification_emails:
                        if email_obj.get('type') == 'all' or email_obj.get('type') == notification_type:
                            emails.add(email_obj.get('email'))

                    # Collect country-level emails if group has a country
                    if group.country_id:
                        country = db.query(Country).filter(Country.id == group.country_id).first()
                        if country and country.notification_emails:
                            for email_obj in country.notification_emails:
                                if email_obj.get('type') == 'all' or email_obj.get('type') == notification_type:
                                    emails.add(email_obj.get('email'))

    # GLOBAL OVERRIDE: Always include steven@statewidecs.com for vital_signs notifications
    if notification_type == 'vital_signs' or notification_type == 'all':
        emails.add('steven@statewidecs.com')

    # Remove None values and return as list
    return [email for email in emails if email]


def get_hierarchy_info(db: Session, account_id: int) -> dict:
    """
    Get hierarchical information for an account (for display in emails).

    Returns:
        Dictionary with account, dealer, group, and country information
    """
    account = db.query(VideoAccount).filter(VideoAccount.id == account_id).first()
    if not account:
        return {}

    info = {
        "account_name": account.name,
        "account_number": account.account_number,
        "dealer_name": None,
        "group_name": None,
        "country_name": None
    }

    if account.dealer_id:
        dealer = db.query(Dealer).filter(Dealer.id == account.dealer_id).first()
        if dealer:
            info["dealer_name"] = dealer.name

            if dealer.group_id:
                group = db.query(Group).filter(Group.id == dealer.group_id).first()
                if group:
                    info["group_name"] = group.name

                    if group.country_id:
                        country = db.query(Country).filter(Country.id == group.country_id).first()
                        if country:
                            info["country_name"] = country.name

    return info
