import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import * as Sentry from '@sentry/browser';
import { json2csv } from 'json-2-csv';

import {
    IAttendee, CustomQuestionAnswer, GroupedAttendees, IEvent, IEventData, IEventDetails, IReservedTicket,
    ISubmitSurveyAnswer, ISubmitSurveyAnswerV2, ISubmitTicketPurchase, ITicket, ITicketDetails,
    MappedAnswer, MappedRecord, Records
} from './entities/Survey';
import { Bindings } from './entities/Bindings';
import UtilsClass from '../src/utils/utils';
import { time } from 'console';

let sentryDsn = {} as Bindings;

// Sentry.init({
//     dsn: sentryDsn.SENTRY_DSN,
//     integrations: [
//         new Sentry.BrowserTracing({
//             // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
//             tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
//         }),
//         new Sentry.Replay(),
//     ],
//     // Performance Monitoring
//     tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
//     // Session Replay
//     replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
//     replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
// });

const app = new Hono<{ Bindings: Bindings; }>();
app.use('*', cors({
    origin: '*'
}));
app.options('*', cors());
app.use('*', prettyJSON());

// proper error handling for technical errors passed from d1 or generic Workers error 
app.onError((err: any, c) => {
    if (err.message.includes('D1')) {
        // Sentry.captureException({
        //     message: err.message,
        //     cause: err.cause.message,
        // });
        return c.json({
            message: err.message,
            cause: err.cause.message,
        });
    } else {
        // Sentry.captureException(err);
        return c.text(`Something went wrong, please contact anjeev@rhingle.com, err: ${err}`);
    }
});

// diong api to pass the event and ticket information
app.post('/api', async (c) => {
    const body = await c.req.json();
    const { data }: IEventData = body;

    if (!data) return c.text(`Please insert json with this format { data : { insertRequiredData }}`);

    // run query to update the event table
    const updateEventTblQuery = await c.env.DB.prepare('UPDATE event_tbl SET event_id=?1, event_type=?2, event_name=?3, event_banner_image=?4, event_start_date=?5, event_end_date=?6, event_primary_colour=?7, event_secondary_colour=?8, event_background_colour=?9, form_start_date=?10, form_end_date=?11, event_venue=?12, reg_header=?13, order_complete_text=?14, reg_ended_text=?15, event_slug=?16, timezone=?17 WHERE event_id=?1')
        .bind(data.event.id, data.event.type, data.event.name, data.event.banner_image,
            data.event.start_date, data.event.end_date, data.event.primary_color,
            data.event.secondary_color, data.event.background_color, data.event.form_start_date, data.event.form_end_date, data.event.venue,
            data.event.registration_header, data.event.order_complete_text, data.event.registration_ended_text, data.event.event_slug, data.event.timezone)
        .run();
    if (updateEventTblQuery.success === true && updateEventTblQuery.meta.changes === 0) {
        // no changes hence this should be a new record for event and ticket
        const queryResponseForEventTable = await c.env.DB.prepare('INSERT INTO event_tbl(event_id, event_type, event_name, event_banner_image, event_start_date, event_end_date, event_primary_colour, event_secondary_colour, event_background_colour, form_start_date, form_end_date, event_venue, reg_header, order_complete_text, reg_ended_text, event_slug, timezone) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)')
            .bind(data.event.id, data.event.type, data.event.name, data.event.banner_image, data.event.start_date, data.event.end_date, data.event.primary_color, data.event.secondary_color,
                data.event.background_color, data.event.form_start_date, data.event.form_end_date, data.event.venue, data.event.registration_header,
                data.event.order_complete_text, data.event.registration_ended_text, data.event.event_slug, data.event.timezone)
            .run();
        // now let's loop through the tickets array to insert into db
        const arrayOfPromises = data.tickets.map(async (elem) => {
            await c.env.DB.prepare('INSERT INTO ticket_tbl (ticket_id, event_id, name, quantity, questions) VALUES (?1, ?2, ?3, ?4, ?5)')
                .bind(elem.id, data.event.id, elem.name, elem.quantity, JSON.stringify(elem.questions))
                .run();
        });
        const awaitedPromises = await Promise.all(arrayOfPromises);
        if (queryResponseForEventTable.success && (awaitedPromises.length)) {
            // loop insert function succesfully awaited, return response
            return c.text(`Succesfully inserted data for event table and inserted ${awaitedPromises.length} records for ticket table`);
        } else {
            c.status(500);
            return c.text('Something went wrong');
        }
    } else if (updateEventTblQuery.success === true && updateEventTblQuery.meta.changes > 0) {
        // event tbl is updated, lets update the ticket table as well
        const arrayOfTicketsToUpdate = data.tickets.map(async (elem) => {
            const updateTicketTblQueryResponse = await c.env.DB.prepare('UPDATE ticket_tbl SET ticket_id=?1, event_id=?2, name=?3, quantity=?4, questions=?5 WHERE event_id=?2')
                .bind(elem.id, data.event.id, elem.name, elem.quantity, JSON.stringify(elem.questions))
                .run();
            // return the success object if query is succesful
            if (updateTicketTblQueryResponse.success) return updateTicketTblQueryResponse.meta;
        });

        const awaitedPromises = await Promise.all(arrayOfTicketsToUpdate);
        return c.text(`Succesfully updated event tbl and ${awaitedPromises} records in ticket table`);
    }
});

// getEvents may be irrelevant
app.get('/getEvents', async (c) => {
    const eventQuestionQuery = await c.env.DB.prepare('SELECT  * FROM event_tbl').all();
    if (!eventQuestionQuery.results?.length || !eventQuestionQuery.success) {
        return c.text('No data found');
    }
    const eventQuestionData = eventQuestionQuery.results as IEventDetails[];
    let ticketArr: unknown[] = [];
    for (const eventQuestionItem of eventQuestionData) {
        const ticketQueryResp = await c.env.DB.prepare('SELECT ticket_id, event_id, name, quantity, questions FROM ticket_tbl WHERE event_id=?1').bind(eventQuestionItem.event_id).all();
        if (!ticketQueryResp.results?.length || !ticketQueryResp.results) return c.json('No tickets found for this event');
        ticketQueryResp.results.forEach((ticketItem) => {
            ticketArr.push(ticketItem);
        });
    }
    const output = {
        event: eventQuestionData,
        ticket: ticketArr,
    };
    return c.json(output);
});

// get the specific event details
app.get('/getEventDetails', async (c) => {
    const eventSlug = c.req.query('eventSlug');
    if (!eventSlug) return c.json('Please pass an eventId');

    const eventQueryResp = await c.env.DB.prepare('SELECT * FROM event_tbl WHERE event_slug=?1').bind(eventSlug).all();
    if (!(eventQueryResp.success || eventQueryResp.results)) return c.json('Failed to get details for this event id');
    if (!eventQueryResp.results?.length) return c.json('Failed to get details for this event id');
    const completeEventDetails = eventQueryResp.results[0] || {} as IEventDetails;

    const ticketQueryResp = await c.env.DB.prepare('SELECT ticket_id, event_id, quantity FROM ticket_tbl WHERE event_slug=?1').bind(eventSlug).all();
    if (!ticketQueryResp.success || !ticketQueryResp.results) return c.json('Failed to get ticket details for this event id');
    if (!ticketQueryResp.results.length) return c.json('Failed to get ticket details for this event id');

    const ticketDetails = ticketQueryResp.results;
    const output = {
        ...completeEventDetails,
        ticketDetails,
    };
    return c.json(output);
});

// api to get the questions
app.post('/surveyQuestion', async (c) => {
    const data: ISubmitTicketPurchase = await c.req.json();

    const eventQueryRespFromDb = await c.env.DB.prepare('SELECT * FROM event_tbl WHERE event_id=?1').bind(data.eventId).all();
    const tempOrderId = nanoid(8);
    let ticketQuestionsForAttendee = [];
    if (!eventQueryRespFromDb.results || !eventQueryRespFromDb.results.length) return c.json('No event found for this id');

    const eventDetails = eventQueryRespFromDb.results[0] as IEvent;

    // check for event ticket type, if basic should only return one ticket obj
    if (eventDetails.event_type === 'basic') {
        if (Array.isArray(data.ticket)) {
            return c.json('Not allowed to choose multiple tickets!');
        }
        const ticketQueryRespFromDb = await c.env.DB.prepare('SELECT * FROM ticket_tbl WHERE event_id=?1').bind(data.eventId).all();
        if (!ticketQueryRespFromDb.results || !ticketQueryRespFromDb.results.length) {
            return c.json(`No questions found for this event: ${data.eventId}`);
        }
        const ticketDetails = ticketQueryRespFromDb.results[0] as ITicket;
        const ticketQuestions = ticketDetails.questions;
        const attendeeId = uuidv4();
        const output = {
            eventId: data.eventId,
            ticketId: ticketDetails.ticket_id,
            orderId: tempOrderId,
            attendeeId,
            attendeeForm: ticketQuestions,
        };

        // got the questions, now update the qty for the ticket
        const updateTicketQtyQueryResp = await c.env.DB.prepare('UPDATE ticket_tbl SET quantity=quantity-1 WHERE ticket_id=?1').bind(ticketDetails.ticket_id).run();
        if (!updateTicketQtyQueryResp.success) return c.json(`Failed to update qty of ticketId: ${ticketDetails.ticket_id}`);

        // reserve the ticket in tbl
        const createReserveTicketQueryResp = await c.env.DB.prepare('INSERT INTO reserved_ticket_tbl(temp_order_id, event_id, ticket_id, attendee_id, created_at) VALUES(?1, ?2, ?3, ?4, ?5)')
            .bind(tempOrderId, data.eventId, ticketDetails.ticket_id, attendeeId, dayjs(Date.now()).toISOString()).all();
        if (!createReserveTicketQueryResp.success) return c.json(`Failed to reserve ticketId: ${ticketDetails.ticket_id} and eventId:${ticketDetails.event_id}`);
        return c.json(output);
    }

    // event is of type full, user may choose to purchase multiple tickets 
    const ticketQueryRespFromDb = await c.env.DB.prepare('SELECT * FROM ticket_tbl WHERE event_id =?1').bind(data.eventId).all();
    const result = ticketQueryRespFromDb.results as ITicketDetails[];
    if (!result) return c.json('No data found in db', 500);

    const differenceArrayElementValue = data.ticket.filter(({ ticketId }) => !(result.some((ticketInDb) => ticketId === ticketInDb.ticket_id)));
    if (differenceArrayElementValue.length) {
        return c.json('Invalid ticket id');
    }

    let updateTicketPromise: D1Result<unknown>[] = [];

    for (const selectedTicket of data.ticket) {
        const matchingTickets = result.filter(ticket => ticket.ticket_id === selectedTicket.ticketId);

        for (const matchingTicket of matchingTickets) {
            for (let i = 0; i < selectedTicket.quantity; i += 1) {
                const attendeeId = uuidv4();
                ticketQuestionsForAttendee.push({
                    ticketId: matchingTicket.ticket_id,
                    attendeeId,
                    questions: matchingTicket.questions
                });
            }
            const queryResultToUpdateTicketQty = await c.env.DB.prepare('UPDATE ticket_tbl SET quantity= quantity- ?1 WHERE ticket_id =?2')
                .bind(selectedTicket.quantity, selectedTicket.ticketId).run();
        }
    }
    await Promise.all(updateTicketPromise);
    const output = {
        eventId: data.eventId,
        orderId: tempOrderId,
        attendeeForms: ticketQuestionsForAttendee,
    };

    const promiseResponse = ticketQuestionsForAttendee.map(async (elem) => {
        const queryInsertToDb = await c.env.DB.prepare('INSERT INTO reserved_ticket_tbl(temp_order_id, event_id, ticket_id, attendee_id, created_at) VALUES(?1, ?2, ?3, ?4, ?5)')
            .bind(tempOrderId, data.eventId, elem.ticketId, elem.attendeeId, dayjs(Date.now()).toISOString()).all();
        return queryInsertToDb;
    });
    await Promise.all(promiseResponse);
    return c.json(output);
});

// submit answers for basic type event
app.post('/surveyAnswer', async (c) => {

    const { data }: ISubmitSurveyAnswer = await c.req.json();
    const { eventId, ticketId, attendeeId, orderId, p_first_name, p_last_name, p_full_name, p_company_name, p_contact_number, p_email, p_job_title, ...rest } = data || null;

    // check reserved ticket tbl if attendee id is present, allow user proceed to answer form if attendee id is present.
    const getAttendeeReservedTicket = await c.env.DB.prepare('SELECT * FROM reserved_ticket_tbl WHERE attendee_id =?1 AND temp_order_id=?2 AND event_id=?3 AND ticket_id=?4')
        .bind(attendeeId, orderId, eventId, ticketId).all();
    if (!getAttendeeReservedTicket.results?.length) return c.json({
        message: 'Sorry, you may have exceed the time limit or is not allowed to answer this form.'
    });

    const customQuestions = JSON.stringify(rest);
    const insertAttendeeDataResponse = await c.env.DB.prepare('INSERT INTO attendee_tbl(reference_id, order_id, event_id, ticket_id, firstName, lastName, fullName, email, contactNumber, companyName, jobTitle, customQuestions) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)')
        .bind(attendeeId, orderId, eventId, ticketId, p_first_name, p_last_name, p_full_name || null, p_email, p_contact_number, p_company_name, p_job_title, customQuestions)
        .run();

    if (!insertAttendeeDataResponse.success) return c.json({
        message: 'Failed to insert attendee data into tbl',
    });
    const removedReservedTicketResponse = await c.env.DB.prepare('DELETE FROM reserved_ticket_tbl WHERE attendee_id=?1').bind(attendeeId).run();

    if (removedReservedTicketResponse.error || !removedReservedTicketResponse.success) return c.json('Failed to removed registered attendee from reserved ticket tbl');

    return c.json('Thank you for registering with us!');

    // let smsResponse;
    // smsResponse = await new UtilsClass().SendMessage(p_first_name, p_email, c.env.SENDGRID_URL, c.env.SENDGRID_API_TOKEN);
    // return c.json(smsResponse);

});

// submit answers for full type event
app.post('/surveyAnswerv2', async (c) => {
    const { data }: ISubmitSurveyAnswerV2 = await c.req.json();
    // const reservedTicketDetails = ((await c.env.DB.prepare('SELECT * FROM reserved_ticket_tbl').all()).results) as IReservedTicket[];
    let testArr = [];
    let smsResponseArray = [];
    let smsResponse;
    for (const submittedItem of data) {
        const reservedTicketQueryResponse = await c.env.DB.prepare('SELECT attendee_id, ticket_id FROM reserved_ticket_tbl WHERE attendee_id=?1 AND ticket_id=?2 AND temp_order_id=?3')
            .bind(submittedItem.attendeeId, submittedItem.ticketId, submittedItem.orderId)
            .all();
        if (!reservedTicketQueryResponse.results || !reservedTicketQueryResponse.results.length) {
            return c.json({
                error: `Sorry, you may have exceed the time limit or is not allowed to answer this form.`,
            });
        }
        const { eventId, ticketId, attendeeId, orderId, p_first_name, p_last_name, p_full_name, p_company_name, p_contact_number, p_email, p_job_title, ...rest } = submittedItem;
        const getAttendeeReservedTicket = await c.env.DB.prepare('SELECT * FROM reserved_ticket_tbl WHERE attendee_id =?1 AND temp_order_id=?2 AND event_id=?3 AND ticket_id=?4')
            .bind(attendeeId, orderId, eventId, ticketId).all();
        if (!getAttendeeReservedTicket.results?.length) return c.json('Sorry, you may have exceed the time limit or is not allowed to answer this form.');

        const customQuestions = JSON.stringify(rest);
        const insertAttendeeDataResponse = await c.env.DB.prepare('INSERT INTO attendee_tbl(reference_id, order_id, event_id, ticket_id, firstName, lastName, fullName, email, contactNumber, companyName, jobTitle, customQuestions) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)')
            .bind(attendeeId, orderId, eventId, ticketId, p_first_name, p_last_name, p_full_name || null, p_email, p_contact_number, p_company_name, p_job_title, customQuestions)
            .run();
        if (!insertAttendeeDataResponse.success) return c.json('Failed to insert attendee data into tbl');
        const removedReservedTicketResponse = await c.env.DB.prepare('DELETE FROM reserved_ticket_tbl WHERE attendee_id=?1').bind(attendeeId).run();
        if (removedReservedTicketResponse.error || !removedReservedTicketResponse.success) return c.json('Failed to removed registered attendee from reserved ticket tbl');

        smsResponse = await new UtilsClass().SendMessage(p_first_name, p_email, c.env.SENDGRID_URL, c.env.SENDGRID_API_TOKEN);
        smsResponseArray.push(smsResponse);
    }
    return c.json({
        smsResponseArray,
    });
});

// diong's api to get attendee information and store in his db
app.get('/attendeeOrder', async (c) => {
    const { eventId } = c.req.query();
    const eventIdNum = parseInt(eventId);
    const attendeeOrderQueryResponse = (await c.env.DB.prepare('SELECT * FROM attendee_tbl WHERE event_id=?1 ORDER BY order_id')
        .bind(eventIdNum)
        .all());
    if (!attendeeOrderQueryResponse.results) {
        return c.json({
            error: 'No attendee details found!'
        });
    }
    if (!attendeeOrderQueryResponse.results.length) {
        return c.json({
            error: 'No details found!',
        });
    }
    const attendeeOrderDetails = attendeeOrderQueryResponse.results as IAttendee[];
    async function groupAttendeesByOrder(attendees: IAttendee[]): Promise<GroupedAttendees[]> {
        const result: GroupedAttendees[] = [];
        const groupedOrders: { [key: string]: GroupedAttendees; } = {};

        for (const attendee of attendees) {
            const orderId = attendee.order_id;
            if (!groupedOrders[orderId]) {
                const groupedAttendee: GroupedAttendees = {
                    event_id: attendee.event_id,
                    order_id: orderId,
                    attendees: [],
                };
                groupedOrders[orderId] = groupedAttendee;
                result.push(groupedAttendee);
            }
            groupedOrders[orderId].attendees.push({
                ticket_id: attendee.ticket_id,
                reference_id: attendee.reference_id,
                firstName: attendee.firstName,
                lastName: attendee.lastName,
                fullName: attendee.fullName,
                email: attendee.email,
                contactNumber: attendee.contactNumber,
                companyName: attendee.companyName,
                jobTitle: attendee.jobTitle,
                customQuestions: attendee.customQuestions
            });
        }
        return result;
    };
    const resp = await groupAttendeesByOrder((attendeeOrderDetails as IAttendee[]));
    return c.json(resp);
});

// api to export attendee information
app.get('/sendEmail', async (c) => {
    const eventId = c.req.query('eventId');
    if (!eventId) return c.json('Invalid eventId');
    let data: IAttendee[] = [];
    let sortedAttendeeData = [];

    let mappedAnswers: MappedAnswer[] = [];

    data = (await c.env.DB.prepare('SELECT * FROM attendee_tbl WHERE event_id=?1').bind(eventId)
        .all()).results as IAttendee[];
    if (!data || !data.length) return c.json({
        sendEmailError: 'No email found for attendee!',
    });

    const ticketDetailsFromDb = (await c.env.DB.prepare('SELECT * FROM ticket_tbl WHERE event_id=?1 AND ticket_id=?2')
        .bind(eventId, data[0].ticket_id)
        .all()).results as ITicket[];

    const parsedQuestionsFromDb = (JSON.parse(ticketDetailsFromDb[0].questions)).pages[0].elements;

    const mappedRecords = mapCustomQuestionAnswers(data);
    const csv = await json2csv(mappedRecords);
    const textEncoder = new TextEncoder();
    const csvBytes = textEncoder.encode(csv);
    const base64Csv = await base64FromArrayBuffer(csvBytes.buffer);
    const headers = {
        Authorization: `Bearer ${c.env.SENDGRID_API_TOKEN}`,
        'Content-Type': 'application/json',
    };

    const body = JSON.stringify({
        personalizations: [
            {
                to: [{ email: 'anjeev@rhingle.com' }],
                subject: 'This is your generated report',
            }
        ],
        from: { email: 'noreply@attendworker.portal.my' },
        content: [
            {
                type: 'text/plain',
                value: 'Please find the attached CSV report.'
            }
        ],
        attachments: [
            {
                content: base64Csv,
                filename: `report${eventId}.csv`,
                type: 'text/csv',
                disposition: 'attachment'
            }
        ]
    });

    try {
        const response = await fetch(c.env.SENDGRID_URL, {
            method: 'POST',
            headers: headers,
            body: body,
        });
        if (response.ok) return c.json('Done ! Please check your email for the exported report.');
    } catch (err) {
        return c.json(err);
    }
    return c.json('OK');


    function mapCustomQuestionAnswers(data: Records[]): MappedRecord[] {
        return data.map((record) => {
            const customQuestions: CustomQuestionAnswer = JSON.parse(record.customQuestions);

            const mappedCustomQuestions: { [key: string]: string; } = {};

            for (const key in customQuestions) {
                const questionTitle = findQuestionTitleByKey(key);
                if (questionTitle) {
                    const question = findQuestionByKey(key);
                    if (question && question.type === "matrix") {
                        const rowAnswer = customQuestions[key] as unknown as { [key: string]: string; };
                        const formattedAnswer = mapMatrixAnswer(question, rowAnswer);
                        mappedCustomQuestions[questionTitle] = formattedAnswer;
                    } else {
                        mappedCustomQuestions[questionTitle] = customQuestions[key] as string;
                    }
                }
            }

            return {
                ...record,
                // customQuestions: mappedCustomQuestions,
                ...mappedCustomQuestions
            };
        });
    }
    function findQuestionByKey(key: string) {
        return parsedQuestionsFromDb.find((q: { name: string; }) => q.name === key);
    }

    function findQuestionTitleByKey(key: string): string | undefined {
        const question = parsedQuestionsFromDb.find((q: { name: string; }) => q.name === key);
        return question ? question.title : undefined;
    }

    function mapMatrixAnswer(question: any, rowAnswer: { [key: string]: string; }): string {
        const formattedAnswers: string[] = [];
        for (const row of question.rows) {
            if (row.value in rowAnswer) {
                const rowText = row.text;
                const rowValue = rowAnswer[row.value];
                formattedAnswers.push(`${rowText}: ${rowValue}`);
            }
        }
        return formattedAnswers.join(", ");
    }

    async function base64FromArrayBuffer(arrayBuffer: ArrayBufferLike) {
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;

        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        // btoa maybe deprecated
        return btoa(binary);
    }
});

// add new column in db
app.post('/addColumn', async (c) => {
    const eventSlugResponse = await c.env.DB.prepare('ALTER TABLE event_tbl ADD event_slug TEXT').run();
    const timezoneResponse = await c.env.DB.prepare('ALTER TABLE event_tbl ADD timezone TEXT').run();

    if (eventSlugResponse.success && timezoneResponse.success) return c.json({
        eventSlug: eventSlugResponse,
        timeZone: timezoneResponse
    });
});
export default app;