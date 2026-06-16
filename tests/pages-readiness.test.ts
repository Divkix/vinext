import { describe, expect, it } from "vite-plus/test";
import { computePagesNextDataQuery } from "../packages/vinext/src/server/pages-readiness.js";

describe("computePagesNextDataQuery", () => {
  const query = { id: "42", q: "foo" };
  const params = { id: "42" };

  it("returns the full merged query for getServerSideProps pages (#1970)", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: false,
        autoExport: false,
        gsp: undefined,
      }),
    ).toEqual({ id: "42", q: "foo" });
  });

  it("returns the full merged query for getInitialProps pages", () => {
    // gip/appGip pages classify as non-autoExport, non-gsp → full query.
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: false,
        autoExport: false,
        gsp: undefined,
      }),
    ).toEqual({ id: "42", q: "foo" });
  });

  it("drops the querystring for getStaticProps pages (route params only)", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: false,
        autoExport: false,
        gsp: true,
      }),
    ).toEqual({ id: "42" });
  });

  it("keeps route params for autoExport pages (drops the querystring)", () => {
    // Route params are kept (not reset to {}) so vinext's client can recover a
    // rewritten dynamic route's params from __NEXT_DATA__.query on hydration.
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: false,
        autoExport: true,
        gsp: undefined,
      }),
    ).toEqual({ id: "42" });
  });

  it("keeps route params for getStaticPaths fallback shell renders", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: true,
        autoExport: false,
        gsp: undefined,
      }),
    ).toEqual({ id: "42" });
  });
});
