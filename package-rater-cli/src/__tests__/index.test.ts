import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "@commander-js/extra-typings";
import { URLFileCommand } from "../commands/URLFileCommand";
import { TestCommand } from "../commands/TestCommand";

// Mock the commands
vi.mock("./commands/TestCommand.js");
vi.mock("./commands/URLFileCommand.js");

describe("CLI Program", () => {
  let program: Command;

  beforeEach(() => {
    // Reset the Command instance before each test
    program = new Command();

    // Set up the commands again
    program
      .command("test")
      .description("Run tests")
      .action(() => {
        TestCommand.run();
      });

    program
      .arguments("<file>")
      .description("Process a URL file")
      .action((file) => {
        URLFileCommand.run(file);
      });
  });

  it("should call TestCommand.run when 'test' command is executed", async () => {
    // Mock the function
    const mockTestRun = vi.spyOn(TestCommand, "run");

    // Simulate running the 'test' command
    await program.parseAsync(["node", "cli.js", "test"]);

    // Expect the TestCommand.run to have been called
    expect(mockTestRun).toHaveBeenCalled();
  });

  it("should call URLFileCommand.run with the correct file path when a file argument is passed", async () => {
    // Mock the function
    const mockURLFileRun = vi.spyOn(URLFileCommand, "run");

    const testFilePath = "path/to/urlFile.txt";

    // Simulate running the CLI with a file argument
    await program.parseAsync(["node", "cli.js", testFilePath]);

    // Expect the URLFileCommand.run to have been called with the correct argument
    expect(mockURLFileRun).toHaveBeenCalledWith(testFilePath);
  });
});
