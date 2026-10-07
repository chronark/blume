import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import {
  SAMPLE_LANGUAGE_IDS,
  sampleLanguageId,
  sampleLanguageInfo,
  sampleLanguages,
  unknownSampleLanguages,
} from "../src/components/openapi/snippets.ts";
import type { RequestSample } from "../src/components/openapi/snippets.ts";

/**
 * The generated code-sample languages beyond curl, fetch, and requests
 * (`src/components/openapi/snippets.ts`): each renders a finished request in
 * its own idiom and quotes every value with its own string rules.
 */

/** A value with the characters each language's string rules differ on. */
const NASTY = `it's "q" $x #{y} \\p\u0001`;

const POST: RequestSample = {
  body: `{"note":${JSON.stringify(NASTY)}}`,
  headers: {
    Authorization: "Bearer $TOKEN",
    "Content-Type": "application/json",
  },
  method: "POST",
  url: "https://api.example.com/items",
};
const GET: RequestSample = {
  headers: {},
  method: "GET",
  url: "https://api.example.com/items",
};
const HEAD: RequestSample = {
  headers: { Accept: "*/*" },
  method: "HEAD",
  url: "https://api.example.com/items",
};
const TRACE: RequestSample = { ...GET, method: "TRACE" };
const QUERY: RequestSample = {
  body: "q=1",
  headers: {},
  method: "QUERY",
  url: "https://api.example.com/items",
};
const FORM: RequestSample = {
  formData: [
    ["note", NASTY],
    ['we"ird', "v"],
  ],
  headers: { Authorization: "Bearer x" },
  method: "POST",
  url: "https://api.example.com/upload",
};

const build = (id: string, sample: RequestSample): string => {
  const [language] = sampleLanguages([id]);
  if (!language) {
    throw new Error(`no ${id} sample language`);
  }
  return language.build(sample);
};

describe("sample languages", () => {
  it("reads ReadMe's ids, and names the ids it generates nothing for", () => {
    expect(sampleLanguageId("cplusplus")).toBe("cpp");
    expect(
      unknownSampleLanguages(["curl", "cplusplus", "objectivec", "Clojure"])
    ).toStrictEqual(["objectivec", "Clojure"]);
    expect(unknownSampleLanguages(false)).toStrictEqual([]);
  });

  it("offers every language Mintlify generates, under its aliases", () => {
    expect(SAMPLE_LANGUAGE_IDS).toEqual([
      "curl",
      "python",
      "js",
      "node",
      "typescript",
      "php",
      "go",
      "java",
      "ruby",
      "powershell",
      "swift",
      "csharp",
      "dotnet",
      "c",
      "cpp",
      "kotlin",
      "rust",
      "dart",
    ]);
    expect(
      [
        "sh",
        "nodejs",
        "ts",
        "golang",
        "rb",
        "c#",
        ".NET",
        "c++",
        "kt",
        "rs",
        "flutter",
      ].map(sampleLanguageId)
    ).toEqual([
      "curl",
      "node",
      "typescript",
      "go",
      "ruby",
      "csharp",
      "dotnet",
      "cpp",
      "kotlin",
      "rust",
      "dart",
    ]);
    expect(sampleLanguageInfo("C#")).toEqual({ label: "C#", lang: "csharp" });
    expect(sampleLanguageInfo("elixir")).toBeNull();
  });
});

describe("string escapes", () => {
  it("names tabs, returns, and newlines rather than writing them raw", () => {
    expect(build("go", { ...GET, url: "https://x.test/\t\r\n" })).toContain(
      String.raw`"https://x.test/\t\r\n"`
    );
  });
});

describe("Node.js", () => {
  it("sends through axios, with a FormData body for a form", () => {
    const post = build("node", POST);
    expect(post).toContain('import axios from "axios";');
    expect(post).toContain(
      '  method: "POST",\n  url: "https://api.example.com/items",'
    );
    expect(post).toContain('    "Authorization": "Bearer $TOKEN"');
    expect(post).toContain(String.raw`  data: "{\"note\":`);
    const form = build("node", FORM);
    expect(form).toContain('form.append("we\\"ird", "v");');
    expect(form).toContain("  data: form");
    expect(build("node", GET)).not.toContain("headers");
  });
});

describe("TypeScript", () => {
  it("types the fetch response", () => {
    expect(build("typescript", GET)).toContain(
      'const response: Response = await fetch("https://api.example.com/items", {'
    );
    expect(build("typescript", TRACE)).toContain(
      "fetch() refuses the TRACE method"
    );
  });
});

describe("PHP", () => {
  it("sets curl options with single-quoted strings", () => {
    const post = build("php", POST);
    expect(post).toContain("CURLOPT_CUSTOMREQUEST => 'POST'");
    expect(post).toContain("    'Authorization: Bearer $TOKEN',");
    expect(post).toContain(
      String.raw`CURLOPT_POSTFIELDS => '{"note":"it\'s \\"q\\" $x #{y} \\\\p\\u0001"}'`
    );
    expect(build("php", HEAD)).toContain("CURLOPT_NOBODY => true");
    expect(build("php", FORM)).toContain(
      "  CURLOPT_POSTFIELDS => [\n    'note' => 'it\\'s \"q\" $x #{y} \\\\p\u0001',\n    'we\"ird' => 'v',\n  ]"
    );
  });
});

describe("Go", () => {
  it("builds a net/http request, importing only what it uses", () => {
    const post = build("go", POST);
    expect(post).toContain('\t"strings"');
    expect(post).toContain("\tbody := strings.NewReader(");
    expect(post).toContain(
      '\treq.Header.Set("Authorization", "Bearer $TOKEN")'
    );
    const get = build("go", GET);
    expect(get).toContain(
      'http.NewRequest("GET", "https://api.example.com/items", nil)'
    );
    expect(get).not.toContain("strings");
    const form = build("go", FORM);
    expect(form).toContain(
      '\tform.WriteField("note", "it\'s \\"q\\" $x #{y} \\\\p\\x01")'
    );
    expect(form).toContain(
      '\treq.Header.Set("Content-Type", form.FormDataContentType())'
    );
    expect(form).toContain('\t"mime/multipart"');
  });
});

describe("Java", () => {
  it("builds an HttpRequest, writing a form body out by hand", () => {
    const post = build("java", POST);
    expect(post).toContain('    .header("Authorization", "Bearer $TOKEN")');
    expect(post).toContain(
      '    .method("POST", HttpRequest.BodyPublishers.ofString('
    );
    expect(build("java", GET)).toContain(
      '    .method("GET", HttpRequest.BodyPublishers.noBody())'
    );
    const form = build("java", FORM);
    expect(form).toContain(
      "multipart/form-data; boundary=BlumeFormBoundary7MA4YWxkTrZu0gW"
    );
    expect(form).toContain(String.raw`name=\"we%22ird\"`);
    expect(form).toContain(String.raw`\\p\u0001`);
  });
});

describe("Ruby", () => {
  it("uses Net::HTTP's class for the method, or a generic request", () => {
    const post = build("ruby", POST);
    expect(post).toContain("request = Net::HTTP::Post.new(uri)");
    expect(post).toContain('request["Authorization"] = "Bearer $TOKEN"');
    // `#` is escaped so `#{…}` can't interpolate.
    expect(post).toContain(String.raw`\#{y}`);
    expect(build("ruby", QUERY)).toContain(
      'request = Net::HTTPGenericRequest.new("QUERY", true, true, uri)'
    );
    expect(build("ruby", FORM)).toContain(
      String.raw`request.set_form([["note", "it's \"q\" $x \#{y} \\p\u0001"], ["we\"ird", "v"]], "multipart/form-data")`
    );
  });
});

describe("PowerShell", () => {
  it("passes the body's type as -ContentType and quotes with single quotes", () => {
    const post = build("powershell", POST);
    expect(post).toContain(
      "-Method POST -Headers $headers -ContentType 'application/json'"
    );
    expect(post).not.toContain("'Content-Type' =");
    expect(post).toContain(`-Body '{"note":"it''s`);
    expect(build("powershell", QUERY)).toContain("-CustomMethod 'QUERY'");
    expect(build("powershell", FORM)).toContain("-Form $form");
    // Typographic quotes close a PowerShell string too.
    expect(
      build("powershell", { ...GET, url: "https://x.test/\u2019" })
    ).toContain("'https://x.test/\u2019\u2019'");
  });
});

describe("Swift", () => {
  it("uses URLSession, with \\u{} escapes", () => {
    const post = build("swift", POST);
    expect(post).toContain('request.httpMethod = "POST"');
    expect(post).toContain(
      'request.setValue("Bearer $TOKEN", forHTTPHeaderField: "Authorization")'
    );
    expect(build("swift", FORM)).toContain(String.raw`\\p\u{1}`);
    expect(build("swift", GET)).not.toContain("httpBody");
  });
});

describe("C#", () => {
  it("sets the body's type as a content header", () => {
    const post = build("csharp", POST);
    expect(post).toContain(
      'new HttpRequestMessage(new HttpMethod("POST"), "https://api.example.com/items");'
    );
    expect(post).toContain(
      'request.Headers.TryAddWithoutValidation("Authorization", "Bearer $TOKEN");'
    );
    expect(post).toContain('MediaTypeHeaderValue.Parse("application/json")');
    expect(build("csharp", QUERY)).not.toContain("MediaTypeHeaderValue");
    expect(build("csharp", FORM)).toContain(
      'form.Add(new StringContent("v"), "we\\"ird");'
    );
  });
});

describe(".NET (RestSharp)", () => {
  it("maps the method onto RestSharp's enum, or explains it can't", () => {
    const post = build("dotnet", POST);
    expect(post).toContain(
      'new RestRequest("https://api.example.com/items", Method.Post);'
    );
    expect(post).toContain('request.AddStringBody("');
    expect(post).toContain('", "application/json");');
    expect(build("dotnet", { ...QUERY, method: "PUT" })).toContain(
      '"q=1", "text/plain");'
    );
    expect(build("dotnet", FORM)).toContain(
      "request.AlwaysMultipartFormData = true;"
    );
    expect(build("dotnet", TRACE)).toContain("RestSharp has no TRACE method");
  });
});

describe("C (libcurl)", () => {
  it("sets options, frees what it allocates, and escapes in octal", () => {
    const post = build("c", POST);
    expect(post).toContain(
      'headers = curl_slist_append(headers, "Authorization: Bearer $TOKEN");'
    );
    expect(post).toContain('CURLOPT_CUSTOMREQUEST, "POST"');
    expect(post).toContain("curl_slist_free_all(headers);");
    expect(build("c", HEAD)).toContain("CURLOPT_NOBODY, 1L");
    const get = build("c", GET);
    expect(get).not.toContain("curl_slist");
    const form = build("c", FORM);
    expect(form).toContain(
      String.raw`curl_mime_data(part, "it's \"q\" $x #{y} \\p\001", CURL_ZERO_TERMINATED);`
    );
    expect(form).toContain("curl_mime_free(form);");
    // No trigraph can form.
    expect(build("c", { ...GET, url: "https://x.test/??=" })).toContain(
      String.raw`"https://x.test/?\?="`
    );
  });
});

describe("C++ (cpr)", () => {
  it("calls cpr's function for the method, or explains it can't", () => {
    const post = build("cpp", POST);
    expect(post).toContain("cpr::Response response = cpr::Post(");
    expect(post).toContain(
      'cpr::Header{{"Authorization", "Bearer $TOKEN"}, {"Content-Type", "application/json"}}'
    );
    expect(build("cpp", FORM)).toContain('cpr::Multipart{{"note", ');
    expect(build("cpp", GET)).toBe(
      '#include <cpr/cpr.h>\n\nint main() {\n  cpr::Response response = cpr::Get(\n      cpr::Url{"https://api.example.com/items"});\n}'
    );
    expect(build("cpp", TRACE)).toContain("cpr has no TRACE method");
  });
});

describe("Kotlin (OkHttp)", () => {
  it("puts the type on the body and follows OkHttp's body rules", () => {
    const post = build("kotlin", POST);
    expect(post).toContain('.toRequestBody("application/json".toMediaType()))');
    expect(post).toContain('.addHeader("Authorization", "Bearer \\$TOKEN")');
    expect(post).not.toContain('.addHeader("Content-Type"');
    // No type: a bare body.
    expect(build("kotlin", QUERY)).toContain(
      '.method("QUERY", "q=1".toRequestBody())'
    );
    // OkHttp refuses a GET body and requires a POST one.
    expect(build("kotlin", { ...QUERY, method: "GET" })).toContain(
      '.method("GET", null)'
    );
    expect(build("kotlin", { ...GET, method: "POST" })).toContain(
      '.method("POST", "".toRequestBody())'
    );
    expect(build("kotlin", FORM)).toContain(
      '.addFormDataPart("note", "it\'s \\"q\\" \\$x #{y} \\\\p\\u0001")'
    );
  });
});

describe("Rust (reqwest)", () => {
  it("uses reqwest's Method constants, or parses one", () => {
    const post = build("rust", POST);
    expect(post).toContain(
      '.request(reqwest::Method::POST, "https://api.example.com/items")'
    );
    expect(post).toContain('.header("Authorization", "Bearer $TOKEN")');
    expect(build("rust", QUERY)).toContain(
      'reqwest::Method::from_bytes("QUERY".as_bytes()).unwrap()'
    );
    const form = build("rust", FORM);
    expect(form).toContain(
      String.raw`.text("note", "it's \"q\" $x #{y} \\p\u{1}")`
    );
    expect(form).toContain(".multipart(form)");
  });
});

describe("Dart (package:http)", () => {
  it("escapes $ in single-quoted strings", () => {
    const post = build("dart", POST);
    expect(post).toContain(
      "final request = http.Request('POST', Uri.parse('https://api.example.com/items'));"
    );
    expect(post).toContain("  'Authorization': 'Bearer \\$TOKEN',");
    const form = build("dart", FORM);
    expect(form).toContain("http.MultipartRequest('POST'");
    expect(form).toContain(
      String.raw`request.fields['note'] = 'it\'s "q" \$x #{y} \\p\x01';`
    );
    expect(build("dart", GET)).not.toContain("request.headers");
  });
});

/**
 * The toolchain checks spawn a compiler once per sample. `swiftc` starts in
 * well under a second on macOS but takes over a second per run on the
 * Ubuntu runner, so five samples overran Bun's 5-second default there.
 */
const TOOLCHAIN_TIMEOUT_MS = 60_000;

describe("syntax, where the toolchain is installed", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { force: true, recursive: true }))
    );
  });

  const samples = [POST, GET, HEAD, QUERY, FORM];

  it.skipIf(!Bun.which("ruby"))(
    "parses every Ruby sample",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "blume-snippet-ruby-"));
      dirs.push(dir);
      for (const [index, sample] of samples.entries()) {
        const file = join(dir, `${index}.rb`);
        // oxlint-disable-next-line no-await-in-loop -- one file per sample
        await writeFile(file, build("ruby", sample));
        const result = spawnSync("ruby", ["-c", file]);
        expect(result.status, result.stderr.toString()).toBe(0);
      }
    },
    TOOLCHAIN_TIMEOUT_MS
  );

  it.skipIf(!Bun.which("swiftc"))(
    "parses every Swift sample",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "blume-snippet-swift-"));
      dirs.push(dir);
      for (const [index, sample] of samples.entries()) {
        const file = join(dir, `s${index}.swift`);
        // oxlint-disable-next-line no-await-in-loop -- one file per sample
        await writeFile(file, build("swift", sample));
        const result = spawnSync("swiftc", ["-parse", file]);
        expect(result.status, result.stderr.toString()).toBe(0);
      }
    },
    TOOLCHAIN_TIMEOUT_MS
  );
});
