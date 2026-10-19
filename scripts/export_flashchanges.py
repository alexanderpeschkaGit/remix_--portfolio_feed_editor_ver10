import subprocess
import json
import re
import os

def main():
    diff_text = subprocess.check_output(
        ['git', 'diff', '-U3'],
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    file_diffs = re.split(r'^diff --git ', diff_text, flags=re.MULTILINE)

    result = {
        "branch": "main",
        "message": "feat: r2 sync robustification, state persistence, and skills sync",
        "files": []
    }

    for part in file_diffs:
        if not part.strip():
            continue
        lines = part.splitlines()
        header_line = lines[0]
        match = re.match(r'a/(.*?)\s+b/(.*)', header_line)
        if not match:
            continue
        file_path = match.group(2)

        # find hunks
        hunks = []
        current_hunk = None
        for line in lines[1:]:
            if line.startswith('@@ '):
                if current_hunk is not None:
                    hunks.append(current_hunk)
                current_hunk = []
            elif current_hunk is not None:
                current_hunk.append(line)
        if current_hunk is not None:
            hunks.append(current_hunk)

        for hunk in hunks:
            search_lines = []
            replace_lines = []
            for line in hunk:
                if line.startswith('-'):
                    search_lines.append(line[1:])
                elif line.startswith('+'):
                    replace_lines.append(line[1:])
                elif line.startswith(' '):
                    search_lines.append(line[1:])
                    replace_lines.append(line[1:])
                # lines starting with \ No newline at end of file are skipped

            result["files"].append({
                "path": file_path.replace("\\", "/"),
                "type": "modify",
                "search": "\n".join(search_lines),
                "replace": "\n".join(replace_lines)
            })

    out_dir = r"Y:\projekte2026\website\repomixes"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "feed-editor_flashchanges.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"SUCCESS: Wrote {len(result['files'])} hunks to {out_path}")

if __name__ == "__main__":
    main()
