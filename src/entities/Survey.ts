export interface IEventData {
    data: {
        event:
        {
            id: number;
            type: string;
            name: string;
            banner_image: string;
            start_date: string;
            end_date: string;
            primary_color: string;
            secondary_color: string;
            background_color: string;
            form_start_date: string;
            form_end_date: string;
            venue: string;
            registration_header: string;
            order_complete_text: string;
            registration_ended_text: string;
            email_template_html: string;
            event_slug: string;
            timezone: string;
        },
        tickets: [
            {
                id: number;
                name: string;
                quantity: number;
                questions: string;
            }
        ];
    };
}

export interface IEvent {
    event_id: number;
    event_type: string;
    event_name: string;
    event_banner_image: string;
    event_start_date: string;
    event_end_date: string;
    event_primary_color: string;
    event_secondary_color: string;
    event_background_color: string;
    form_start_date: string;
    form_end_date: string;
    venue: string;
    registration_header: string;
    order_complete_text: string;
    registration_ended_text: string;
}

export interface ITicket {
    ticket_id: number;
    event_id: number;
    name: string;
    quantity: number;
    questions: string;
}

export interface ITicketQuestion {
    pages: [{
        name: string;
        elements: [{
            type: string;
            name: string;
            title: string;
            choices?: { value: string; text: string; }[];
            showOtherItem?: boolean;
            isRequired?: boolean;
            columns?: string[];
            rows?: { value: string; text: string; }[];
        }];
    }];
}

export interface IEventDetails {
    event_id: number;
    event_type: string;
    event_name: string;
    event_banner_image: string;
    event_start_date: string;
    event_end_date: string;
    event_primary_color: string;
    event_secondary_color: string;
    event_background_color: string;
    form_start_date: string;
    form_end_date: string;
    venue: string;
    registration_header: string;
    order_complete_text: string;
    registration_ended_text: string;
    tickets: ITicketDetails[];
}

export interface ISubmitTicketPurchase {
    eventId: number;
    ticket: [{
        ticketId: number;
        quantity: number;
    }];
}

export interface ITicketDetails {
    ticket_id: number;
    event_id: number;
    name: string;
    quantity: number;
    questions: string;
}

export interface ISubmitSurveyAnswer {
    data: {
        eventId: number;
        ticketId: number;
        orderId: string;
        attendeeId: string;
        p_first_name: string;
        p_last_name: string;
        p_full_name?: string;
        p_email: string;
        p_contact_number: number;
        p_company_name: string;
        p_job_title: string;
        // question1: string;
        // question2: string;
        // additional questions can be added, will store as json string 
    };
}

export interface IReservedTicket {
    temp_order_id: string;
    event_id: number;
    ticket_id: number;
    attendee_id: string;
    created_at: string;
}

export interface IAttendee {
    reference_id: string;
    order_id: string;
    event_id: number;
    ticket_id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    contactNumber: number;
    companyName: string;
    jobTitle: string;
    customQuestions: string;
}

export interface SortedAttendees {
    ticket_id: number;
    reference_id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    contactNumber: number;
    companyName: string;
    jobTitle: string;
    customQuestions: string;
}

export interface GroupedAttendees {
    event_id: number;
    order_id: string;
    attendees: SortedAttendees[];
}

export interface ISubmitSurveyAnswerV2 {
    data: {
        eventId: number;
        ticketId: number;
        orderId: string;
        attendeeId: string;
        p_first_name: string;
        p_last_name: string;
        p_full_name: string;
        p_email: string;
        p_contact_number: number;
        p_company_name: string;
        p_job_title: string;
        question1: string;
        question2: string;
        // additional questions can be added, will store as json string 
    }[];
}

export interface CustomQuestionAnswer {
    [key: string]: string;
}

export interface Records {
    reference_id: string;
    order_id: string;
    event_id: number;
    ticket_id: number;
    firstName: string;
    lastName: string;
    fullName: string | null;
    email: string;
    contactNumber: string | number;
    companyName: string;
    jobTitle: string;
    customQuestions: string;
}

export interface MappedRecord {
    reference_id: string;
    order_id: string;
    event_id: number;
    ticket_id: number;
    firstName: string;
    lastName: string;
    fullName: string | null;
    email: string;
    contactNumber: string | number;
    companyName: string;
    jobTitle: string;
    customQuestions?: string;
    // miscellaneous questions regarding event will be inserted here i.e  T-Shirt Size.
    // customQuestions: { [key: string]: string; };
}

export interface MappedAnswer {
    question: string;
    answer: string | { [key: string]: string; };
}
