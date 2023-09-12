import sampleHtml from './../asset/sampleHtml';


export default class UtilsService {

    async SendMessage(name: string, email: string, sendGridUrl: string, sendGridToken: string): Promise<string | undefined> {
        const body = JSON.stringify({
            personalizations: [
                {
                    to: [{ email: 'anjeev@rhingle.com' }],
                    subject: `Hello ${name}, You have successfully registered with us !`,
                }
            ],
            from: { email: 'noreply@attendworker.portal.my' },
            content: [
                {
                    type: 'text/html',
                    value: sampleHtml.sampleHtml
                }
            ],
        });

        const response = await fetch(sendGridUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sendGridToken}`,
                'Content-Type': 'application/json'
            },
            body: body,
        });
        let respText;
        if (!response.ok || response.status !== 200) {
            respText = `Failed to send email to ${email}`;
        } else {
            respText = `Hey ${name}, thank you for registering, please check your email at ${email} for confirmation !`;
        }
        return respText;
    }
}