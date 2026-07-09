# Cost tripwire. The app is designed to sit at $0/month on the free tier, so any
# real spend is a signal something is wrong (e.g. a request flood on the public
# shell or /api/login). AWS Budgets is free for the first two budgets.
resource "aws_budgets_budget" "monthly" {
  name         = "tothemoon-monthly"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Early tripwire: email at the first real dollar of actual spend.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 20 # 20% of $5 = $1 actual
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  # Trend warning: email if the month is forecast to reach the $5 cap.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
