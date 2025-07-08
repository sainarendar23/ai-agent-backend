import { google } from 'googleapis';
import { storage } from '../storage';

class GmailService {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/gmail/callback'
    );
  }

  async getAuthUrl(userId: string): Promise<string> {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId,
    });

    return authUrl;
  }

  async handleCallback(userId: string, code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getAccessToken(code);
    
    await storage.upsertUserCredentials({
      userId,
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token,
      gmailTokenExpiry: new Date(tokens.expiry_date),
    });
  }

  async getAuthenticatedClient(userId: string): Promise<any> {
    const credentials = await storage.getUserCredentials(userId);
    if (!credentials?.gmailAccessToken) {
      throw new Error('Gmail not connected');
    }

    this.oauth2Client.setCredentials({
      access_token: credentials.gmailAccessToken,
      refresh_token: credentials.gmailRefreshToken,
    });

    return this.oauth2Client;
  }

  async getEmails(userId: string, query: string = '', maxResults: number = 10): Promise<any[]> {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const emails = [];
    if (response.data.messages) {
      for (const message of response.data.messages) {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
        });
        emails.push(email.data);
      }
    }

    return emails;
  }

  async sendEmail(userId: string, to: string, subject: string, body: string): Promise<void> {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');

    const base64Email = Buffer.from(email).toString('base64');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: base64Email,
      },
    });
  }

  async starEmail(userId: string, messageId: string): Promise<void> {
    const auth = await this.getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['STARRED'],
      },
    });
  }

  async getEmailContent(email: any): Promise<{
    from: string;
    subject: string;
    body: string;
  }> {
    const headers = email.payload.headers;
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    
    let body = '';
    if (email.payload.body?.data) {
      body = Buffer.from(email.payload.body.data, 'base64').toString();
    } else if (email.payload.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
          break;
        }
      }
    }

    return { from, subject, body };
  }
}

export const gmailService = new GmailService();
