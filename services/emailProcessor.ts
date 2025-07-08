import { gmailService } from './gmailService';
import { openaiService } from './openaiService';
import { storage } from '../storage';

class EmailProcessor {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  async startMonitoring(userId: string): Promise<void> {
    // Stop existing monitoring if any
    this.stopMonitoring(userId);

    // Start monitoring every 5 minutes
    const interval = setInterval(async () => {
      try {
        await this.processNewEmails(userId);
      } catch (error) {
        console.error(`Error processing emails for user ${userId}:`, error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    this.monitoringIntervals.set(userId, interval);
    
    // Process emails immediately on start
    await this.processNewEmails(userId);
  }

  stopMonitoring(userId: string): void {
    const interval = this.monitoringIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(userId);
    }
  }

  async processNewEmails(userId: string): Promise<void> {
    try {
      const credentials = await storage.getUserCredentials(userId);
      if (!credentials?.agentActive) {
        return;
      }

      // Get recent emails from the last 24 hours
      const query = 'is:unread newer_than:1d';
      const emails = await gmailService.getEmails(userId, query, 10);

      for (const email of emails) {
        await this.processEmail(userId, email);
      }
    } catch (error) {
      console.error(`Error processing new emails for user ${userId}:`, error);
    }
  }

  private async processEmail(userId: string, email: any): Promise<void> {
    try {
      // Check if we've already processed this email
      const logs = await storage.getUserEmailLogs(userId);
      const alreadyProcessed = logs.some(log => log.emailId === email.id);
      
      if (alreadyProcessed) {
        return;
      }

      const { from, subject, body } = await gmailService.getEmailContent(email);
      
      // Analyze the email
      const analysis = await openaiService.analyzeEmail(userId, body);
      
      // Create email log
      const emailLog = await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: from,
        subject,
        action: analysis.action,
        status: 'pending',
      });

      // Take appropriate action
      switch (analysis.action) {
        case 'reply':
          await this.handleReplyAction(userId, email, emailLog.id, from, body);
          break;
        case 'star':
          await this.handleStarAction(userId, email, emailLog.id);
          break;
        case 'ignore':
          // Just log it, no action needed
          break;
      }

      // Log activity
      await storage.insertActivity({
        userId,
        type: `email_${analysis.action}`,
        description: `Email ${analysis.action === 'reply' ? 'replied to' : analysis.action === 'star' ? 'starred' : 'processed'}: ${subject}`,
        metadata: {
          from,
          subject,
          action: analysis.action,
          confidence: analysis.confidence,
        },
      });

    } catch (error) {
      console.error(`Error processing email ${email.id}:`, error);
    }
  }

  private async handleReplyAction(
    userId: string,
    email: any,
    logId: number,
    fromEmail: string,
    body: string
  ): Promise<void> {
    try {
      // Generate reply
      const replyText = await openaiService.generateReply(userId, body, fromEmail);
      
      // Send reply
      const { subject } = await gmailService.getEmailContent(email);
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      
      await gmailService.sendEmail(userId, fromEmail, replySubject, replyText);
      
      // Update log
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail,
        subject: replySubject,
        action: 'reply',
        responseText: replyText,
        status: 'sent',
      });

    } catch (error) {
      console.error(`Error sending reply for email ${email.id}:`, error);
      // Update log with error status
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail,
        subject: 'Reply failed',
        action: 'reply',
        status: 'failed',
      });
    }
  }

  private async handleStarAction(userId: string, email: any, logId: number): Promise<void> {
    try {
      await gmailService.starEmail(userId, email.id);
      
      // Update log
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: '',
        subject: 'Email starred',
        action: 'star',
        status: 'sent',
      });

    } catch (error) {
      console.error(`Error starring email ${email.id}:`, error);
      // Update log with error status
      await storage.insertEmailLog({
        userId,
        emailId: email.id,
        fromEmail: '',
        subject: 'Star failed',
        action: 'star',
        status: 'failed',
      });
    }
  }
}

export const emailProcessor = new EmailProcessor();
