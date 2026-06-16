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

  it("resets to {} for autoExport pages", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: false,
        autoExport: true,
        gsp: undefined,
      }),
    ).toEqual({});
  });

  it("resets to {} for getStaticPaths fallback shell renders", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: true,
        autoExport: false,
        gsp: undefined,
      }),
    ).toEqual({});
  });

  it("isFallback overrides gsp (a fallback shell of a gsp page resets to {})", () => {
    expect(
      computePagesNextDataQuery({
        query,
        params,
        isFallback: true,
        autoExport: false,
        gsp: true,
      }),
    ).toEqual({});
  });
});
