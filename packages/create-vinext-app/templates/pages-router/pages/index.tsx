import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Head>
        <title>My vinext App</title>
      </Head>
      <h1>Welcome to vinext</h1>
      <p>
        Edit <code>pages/index.tsx</code> to get started.
      </p>
      <nav>
        <Link href="/about">About</Link>
        {" | "}
        <Link href="/api/hello">API</Link>
      </nav>
    </>
  );
}
