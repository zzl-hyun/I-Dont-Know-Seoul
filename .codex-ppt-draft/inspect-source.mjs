import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const sourcePath = "/Users/macbookpro/Downloads/idontknowseoulPPT.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
console.log("SLIDES", presentation.slides.items.length);
console.log("SIZE", JSON.stringify(presentation.slideSize));
const snapshot = await presentation.inspect({
  kind: "slide,textbox,shape,image,table,chart,notes,layout",
  maxChars: 50000,
});
console.log(snapshot.ndjson ?? snapshot);
for (const [index, slide] of presentation.slides.items.entries()) {
  const rendered = await slide.export({ format: "png", scale: 1 });
  const out = path.join(
    "/Users/macbookpro/Desktop/Work/I-Dont-Know-Seoul/.codex-ppt-draft",
    `source-slide-${index + 1}.png`,
  );
  await (await import("node:fs/promises")).writeFile(out, new Uint8Array(await rendered.arrayBuffer()));
  console.log("RENDERED", index + 1, out);
}
