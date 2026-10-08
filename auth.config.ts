import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Lets the app create its own "Actual time" calendar and manage only the events in it.
  "https://www.googleapis.com/auth/calendar.app.created",
].join(" ");

/**
 * Edge-safe part of the Auth.js config (no database access), shared by
 * middleware and the full server config in lib/auth.ts.
 */
export default {
  providers: [
    Google({
      authorization: {
        params: { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent" },
      },
    }),
  ],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/signin") || pathname.startsWith("/privacy")) return true;
      return !!auth?.user;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
