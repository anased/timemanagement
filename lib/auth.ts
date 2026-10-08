import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    // The adapter only stores tokens when the account is first linked. Keep them
    // fresh on every later sign-in (e.g. after the user re-grants calendar access).
    async signIn({ account }) {
      if (account?.provider !== "google") return;
      await prisma.account.updateMany({
        where: { provider: "google", providerAccountId: account.providerAccountId },
        data: {
          access_token: account.access_token,
          expires_at: account.expires_at,
          scope: account.scope,
          id_token: account.id_token,
          ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
        },
      });
    },
  },
});

/**
 * Returns the signed-in user's id or redirects to /signin. This is the only
 * way server code obtains a userId; it is never taken from client input.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/signin");
  return id;
}
