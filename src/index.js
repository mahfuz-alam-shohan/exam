import { handleRequest } from './router';

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
