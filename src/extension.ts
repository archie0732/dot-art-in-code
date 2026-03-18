import * as vscode from "vscode";
import { join, isAbsolute } from "path";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "fs";


function getCommentWrapper(languageId: string): {
  start: string;
  end: string;
  linePrefix: string;
} {
  switch (languageId) {
    case "c":
    case "cpp":
    case "go":
    case "rust":
    case "javascript":
    case "typescript":
    case "java":
    case "csharp":
      return { start: "/*\n", end: "\n*/", linePrefix: "" };
    case "python":
    case "ruby":
    case "perl":
    case "shellscript":
    case "yaml":
    case "dockerfile":
      return { start: "", end: "", linePrefix: "# " };
    case "html":
    case "xml":
    case "markdown":
      return { start: "", end: "", linePrefix: "" };
    default:
      return { start: "\n", end: "\n", linePrefix: "" };
  }
}

function getAllTextFilesFromFolder(folderPath: string): string[] {
  if (!existsSync(folderPath)) {
    return [];
  }
  const stats = statSync(folderPath);
  if (!stats.isDirectory()) {
    return [];
  }

  try {
    const files = readdirSync(folderPath);
    return files
      .filter((file) => file.endsWith(".txt"))
      .map((file) => join(folderPath, file));
  } catch (error) {
    return [];
  }
}

function insertContentToBottom(
  editor: vscode.TextEditor,
  artFilePath: string,
  artFileName: string,
) {
  try {
    let artContent = readFileSync(artFilePath, "utf8");
    const document = editor.document;
    const langId = document.languageId;
    const comments = getCommentWrapper(langId);

    let finalContent = "\n";

    if (comments.linePrefix) {  
      finalContent += artContent
        .split("\n")
        .map((line) => comments.linePrefix + line)
        .join("\n");
    } else {
      finalContent += comments.start + artContent + comments.end;
    }

    const lastLine = document.lineCount - 1;
    const endPosition = document.lineAt(lastLine).range.end;

    editor.edit((editBuilder) => {
      editBuilder.insert(endPosition, "\n" + finalContent);
    });

    vscode.window.showInformationMessage(
      `Inserted "${artFileName}" successfully!`,
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to read art file: ${artFileName}`);
  }
}


export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(smiley) Insert Dot Art";
  statusBarItem.tooltip = "Click to choose or insert random dot art";
  statusBarItem.command = "dot-art-in-code.insertDotArt";
  statusBarItem.show();

  function gatherAllArtsInfo(): {
    name: string;
    path: string;
    type: "Built-in" | "Custom";
  }[] {
    const builtInFolder = join(context.extensionPath, "img");
    const builtInFiles = getAllTextFilesFromFolder(builtInFolder);
    const builtInArts = builtInFiles.map((path) => ({
      name: path.split(/[\\/]/).pop() || "",
      path: path,
      type: "Built-in" as const,
    }));

    const config = vscode.workspace.getConfiguration("dotArtInCode");
    let customFolderPath = config.get<string>("customFolder") || "";
    let customArts: {
      name: string;
      path: string;
      type: "Built-in" | "Custom";
    }[] = [];

    if (customFolderPath) {
      if (!isAbsolute(customFolderPath) && vscode.workspace.workspaceFolders) {
        customFolderPath = join(
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          customFolderPath,
        );
      }
      const customFiles = getAllTextFilesFromFolder(customFolderPath);
      customArts = customFiles.map((path) => ({
        name: path.split(/[\\/]/).pop() || "",
        path: path,
        type: "Custom" as const,
      }));
    }

    return [...builtInArts, ...customArts];
  }

  let insertCmd = vscode.commands.registerCommand(
    "dot-art-in-code.insertDotArt",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active file opened!");
        return;
      }

      const allArts = gatherAllArtsInfo();

      if (allArts.length === 0) {
        vscode.window.showWarningMessage(
          "No dot art (.txt) files found in folders.",
        );
        return;
      }

      const quickPickItems: vscode.QuickPickItem[] = [];

      quickPickItems.push({
        label: "$(shuffle) Random Insert",
        description: "Pick a random art from the list",
        alwaysShow: true,
      });

      quickPickItems.push({
        label: "Art List",
        kind: vscode.QuickPickItemKind.Separator,
      });

      allArts.forEach((art) => {
        quickPickItems.push({
          label: art.name,
          description: `[${art.type}]`,
          detail: art.path,
        });
      });

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: "Select a dot art or choose Random",
      });

      if (selectedItem) {
        if (selectedItem.label === "$(shuffle) Random Insert") {
          const randomIndex = Math.floor(Math.random() * allArts.length);
          const randomArt = allArts[randomIndex];
          insertContentToBottom(editor, randomArt.path, randomArt.name);
        } else {
          const targetArt = allArts.find(
            (art) => art.name === selectedItem.label,
          );
          if (targetArt) {
            insertContentToBottom(editor, targetArt.path, targetArt.name);
          }
        }
      }
    },
  );

  let saveCmd = vscode.commands.registerCommand(
    "dot-art-in-code.saveSelectionAsArt",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const selection = editor.selection;
      const text = editor.document.getText(selection);

      if (!text.trim()) {
        vscode.window.showWarningMessage("Please select some text first!");
        return;
      }

      const config = vscode.workspace.getConfiguration("dotArtInCode");
      let customFolderPath = config.get<string>("customFolder") || "";

      if (
        customFolderPath &&
        !isAbsolute(customFolderPath) &&
        vscode.workspace.workspaceFolders
      ) {
        customFolderPath = join(
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          customFolderPath,
        );
      }

      if (!customFolderPath || !existsSync(customFolderPath)) {
        vscode.window.showErrorMessage(
          'You must set a valid "Custom Folder" in VS Code settings to save your own art!',
        );
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: "Enter a name for your dot art (e.g. my_cool_sword)",
        placeHolder: "my_art_name",
      });

      if (!fileName) {
        return;
      }

      const safeFileName = fileName.endsWith(".txt")
        ? fileName
        : fileName + ".txt";
      const filePath = join(customFolderPath, safeFileName);

      try {
        writeFileSync(filePath, text, "utf8");
        vscode.window.showInformationMessage(
          `Successfully saved ${safeFileName}! You can use it now.`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to save file: ${error}`);
      }
    },
  );

  context.subscriptions.push(statusBarItem, insertCmd, saveCmd);
}

export function deactivate() { }
