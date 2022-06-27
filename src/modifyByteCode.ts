import { solidityKeccak256 } from "ethers/lib/utils";

export interface LinkReference {
  length: number;
  start: number;
}

export const getLinkedByteCode = (
  byteCode: any,
  fileReferences: any,
  libraries: any
): string => {
  for (const [libName, fixups] of Object.entries(fileReferences)) {
    const addr = libraries[libName];
    if (addr === undefined) {
      continue;
    }
    for (const fixup of fixups as LinkReference[]) {
      const encode = solidityKeccak256(["string"], [libName]).slice(2, 36);
      byteCode =
        byteCode.substr(0, 2 + fixup.start * 2) +
        `__\$${encode}\$__` +
        byteCode.substr(2 + (fixup.start + fixup.length) * 2);
    }
  }

  return byteCode;
};
