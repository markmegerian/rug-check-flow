export function buildReminderDeliveryCopy(params: {
  notificationType: string;
  clientName?: string | null;
  entityLabel?: string | null;
}) {
  const subjectBase = params.entityLabel ?? "your account";

  switch (params.notificationType) {
    case "estimate_reminder_24h":
      return {
        subject: `Estimate follow-up: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nJust following up on ${subjectBase}. We sent this estimate yesterday and wanted to make sure you had what you need to review it.`,
      };
    case "estimate_reminder_72h":
      return {
        subject: `Estimate reminder: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nThis is a 72-hour follow-up on ${subjectBase}. Let us know if you'd like us to proceed or make any changes.`,
      };
    case "estimate_reminder_7d":
      return {
        subject: `Final estimate follow-up: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nThis is a final automated follow-up on ${subjectBase}. Reply in the portal if you'd like to move forward or need changes.`,
      };
    case "invoice_reminder_3d_before_due":
      return {
        subject: `Invoice due soon: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nA quick reminder that ${subjectBase} is due in 3 days.`,
      };
    case "invoice_reminder_due_date":
      return {
        subject: `Invoice due today: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\n${subjectBase} is due today. Please review the balance at your earliest convenience.`,
      };
    case "invoice_reminder_7d_overdue":
      return {
        subject: `Invoice overdue: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\n${subjectBase} is now 7 days overdue. Please reply if there is an issue we should know about.`,
      };
    case "invoice_reminder_14d_overdue":
      return {
        subject: `Second overdue reminder: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\n${subjectBase} is now 14 days overdue. Please contact us if you need help resolving the balance.`,
      };
    case "invoice_weekly_statement":
      return {
        subject: `Weekly account statement: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nThis is your weekly automated statement reminder for ${subjectBase}.`,
      };
    default:
      return {
        subject: `Reminder: ${subjectBase}`,
        body: `Hello ${params.clientName ?? "there"},\n\nThis is an automated reminder regarding ${subjectBase}.`,
      };
  }
}
