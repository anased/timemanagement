import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
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
      const isSignIn = request.nextUrl.pathname.startsWith("/signin");
      if (isSignIn) return true;
      return !!auth?.user;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
