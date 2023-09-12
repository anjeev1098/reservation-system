import { z } from 'zod';

const validator = {
    eventId: z.number(),

};

export default {
    validator,
};