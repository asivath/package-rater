
# Trustworthy Model Re-use CLI Tool

## Overview
This is a Command-Line Interface (CLI) tool designed to process npm and GitHub repository URLs and generate essential metrics to evaluate the trustworthiness and quality of open-source projects. The tool provides key metrics such as Bus Factor, Correctness, Ramp-Up Time, Responsiveness, and License Compatibility, allowing users to make informed decisions about project dependencies.

## Features
- **CLI Tool**: Supports three modes: 
  - `install`: Install the necessary dependencies.
  - `URL_FILE`: Process repository URLs from a file.
  - `test`: Run test cases using Jest.
- **Metrics Calculation**:
  - **Bus Factor**: Evaluates how critical contributors are to the project.
  - **Correctness**: Analyzes code quality based on issue resolution and static analysis.
  - **Ramp-Up Time**: Measures the time required for a new developer to contribute.
  - **Responsiveness**: Tracks the maintainers' response times to issues and PRs.
  - **License Compatibility**: Ensures the repository license is compatible with LGPL v2.1.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mohammed-alaa40123/ECE461_Project_Phase1
   cd ECE461_Project_Phase1
   ```

2. Install the required dependencies:
   ```bash
   npm install
   tsc
   ```

3. Create a `.env` file in the root directory with the following content:
   ```bash
   GITHUB_TOKEN=<your_github_token>
   LOG_FILE=<path_to_log_file>
   LOG_LEVEL=<log_level: 0|1|2>
   ```

## Usage

To run the CLI tool, use the following command structure:

```bash
./run <mode>
```

Where `<mode>` is one of the following:
- `install`: Installs the necessary project dependencies.
- `URL_FILE`: Processes a file containing repository URLs (npm or GitHub).
- `test`: Executes unit tests using Jest.

### Example
To process a file with repository URLs:
```bash
./run URL_FILE ./path_to_url_file.txt
```

To run the test suite:
```bash
./run test
```

## Logging

Logging is implemented using the `winston` library. Logs are stored in the file specified by the `$LOG_FILE` environment variable, with verbosity controlled by the `$LOG_LEVEL` variable:
- `0`: Silent
- `1`: Informational messages
- `2`: Debug messages

## Metrics

### Bus Factor
- **Description**: Measures how many contributors are critical to the repository.
- **Formula**: Number of contributors with >50% commits.

### Correctness
- **Description**: Evaluates the quality of the code based on issue resolution and code errors.
- **Formula**: `(Resolved Issues / Total Issues) + (Errors/Bugs / Lines of Code) / 2`.

### Ramp-Up Time
- **Description**: Time it takes for a new contributor to make their first pull request.

### Responsiveness
- **Description**: Measures the average response time of maintainers to issues and pull requests.

### License Compatibility
- **Description**: Ensures that the repository's license complies with LGPL v2.1 requirements.

## Testing
Unit tests have been implemented using [Jest](https://jestjs.io/). You can run the tests by executing the following command:
```bash
./run test
```

- Aim for 80% code coverage.
- Test cases cover core functionalities and error handling.

## Contribution

1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m 'Add some feature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/your-feature
   ```
5. Open a pull request.

## License
This project is licensed under the LGPL v2.1 License - see the [LICENSE](LICENSE) file for details.

## Contact
For any questions or support, please contact:
- **Andrew Cali**: acali@purdue.edu
- **Amar AlAzizy**: aalazizy@purdue.edu
- **Bola Warsy**: bwarsy@purdue.edu
- **Mohamed Ahmed**: mohame43@purdue.edu
