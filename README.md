# **Package Rater**



### **Overview**

The **Package Rater** tool streamlines package management by enabling users to upload, update, search, download, and reset packages. It helps assess the quality and performance of packages using predefined metrics. This system is designed to enhance decision-making when managing package dependencies in software projects.

The tool operates on an EC2 instance during development, while production environments leverage AWS Lambda for metric calculations.

---

### **Features**

* **Package Management**  
  * **Upload**: Upload packages to the system for evaluation. Ensures the package meets a passable net score.  
  * **Update**: Upload new versions of existing packages for re-evaluation.  
  * **Search**: Search for packages by name or using regular expressions (regex) to search across the repository, README, or version numbers.  
  * **Download**: Download the latest version of a package as a zip file for use in projects.  
  * **Reset**: Reset the entire Package Rater system.  
* **System Environment**  
  * **Development**: Runs on an EC2 instance.  
  * **Production**: Metric calculations are performed on AWS Lambda.

---

### **Installation**

1. **Clone the repository**  
   `git clone https://github.com/asivath/package-rater.git`  
   `cd package-rater`  
2. **Install dependencies**  
   `yarn`  
   `yarn build`  
3. **Run locally**  
   `yarn dev`  
   This will start the backend APIs on port 3000 and the frontend on port 5173\.

**Switch between development and production**:  
To run in production mode, create a `.env` file in the `server` directory with the following content:  
`NODE_ENV=production`  
`AWS_BUCKET_NAME=<bucket_name>`  
`AWS_REGION=us-east-1`  
`AWS_ACCESS_KEY_ID=<ID>`  
`AWS_SECRET_ACCESS_KEY=<secret_id>`  



---

### **Usage**

The **Package Rater CLI** supports the following commands:

* **Upload a Package**  
  `POST /package`  
  Uploads a package for evaluation, ensuring it has a passable net score.  
* **Update a Package**  
  `POST /package/{id}`  
  Uploads a new version of an existing package for re-evaluation.  
* **Search for a Package**  
  `GET /packages`  
  `GET /package/{id}/ByRegEx`  
  Searches the repository for a specific package by name. Supports regex search in README files or version numbers.  
* **Download a Package**  
  `GET /package/{id}`  
  Downloads the specified package as a zip file for use in your projects.  
* **Reset the Package Rater**  
  `DELETE /reset`  
  Resets the entire system, removing all stored packages and data.  
* **Retrieve Cost / Rating**  
  `GET /package/{id}/cost`  
  `GET /package/{id}/rate`  
  Retrieves cost and rating information for the specified package.

  For more detailed information on endpoints in use, observe the `swagger.json` in root

---

### **Metrics**

* **Bus Factor**: Measures how many contributors are critical to the repository.  
* **Correctness**: Evaluates the quality of the code based on issue resolution and code errors.  
* **Ramp-Up Time**: Time it takes for a new contributor to make their first pull request.  
* **Responsiveness**: Measures the average response time of maintainers to issues and pull requests.  
* **License Compatibility**: Ensures that the repository's license complies with LGPL v2.1 requirements.
* **Good Pinning Practices**: Ensures that the repository's dependencies are pinned to specific version and not at risk of change
* **Code through PRs**: Ensures a sufficient amount of lines within main are megred via PR


---

### **Logging**

Logs are output to `package-rater.log`.

---

### **Testing**

Unit tests are implemented using **Vitest**. Front end testing uses **Playwright**. Run the test suite by executing:


`yarn test`

* Aim for at least **60%** code coverage.  
* Tests cover core functionalities, edge cases, and error handling.

Run coverage by entering a desired directory and running

`yarn test:coverage`

---

### **Contribution**

1. **Fork the repository.**  
2. **Create a feature branch**:  
   `git checkout -b feature/your-feature`  
3. **Commit your changes**:  
   `git commit -m 'Add new feature'`  
4. **Push to the branch**:  
   `git push origin feature/your-feature`  
5. **Open a pull request.**

---

### **License**

This project is licensed under the **MIT License**. See the LICENSE file for more details.

---

### **Contact**

For any questions or support, please contact:

* **Aditya Sivathanu**: asivath@purdue.edu  
* **Kevin Chang**: chang820@purdue.edu  
* **Ellis Selznick**: eselznic@purdue.edu