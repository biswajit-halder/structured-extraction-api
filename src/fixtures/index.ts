export interface Fixture {
  name: string;
  schema: 'resume' | 'job_posting';
  text: string;
}

/**
 * Curated demo inputs. POST /admin/seed runs these through the real pipeline
 * once so every later demo request is served from cache (zero OpenRouter calls).
 */
export const fixtures: Fixture[] = [
  {
    name: 'resume-1-backend.txt',
    schema: 'resume',
    text: `ANANYA SHARMA
ananya.sharma@example.com | +91 98765 43210 | Bengaluru, India
Backend engineer with 3 years of experience building Node.js services and REST APIs.
EXPERIENCE
Software Engineer, PayFlow Systems — 2023-04 to present (29 months)
Designed payment webhook services in TypeScript; reduced failed retries by 40%.
Backend Intern, CloudNest — 2022-06 to 2023-03 (9 months)
Built CRUD APIs with Express and PostgreSQL, wrote integration tests with Jest.
SKILLS
Node.js, TypeScript, PostgreSQL, Redis, Docker, AWS, Jest
EDUCATION
B.Tech Computer Science, NIT Karnataka — 2022`,
  },
  {
    name: 'resume-2-junior.txt',
    schema: 'resume',
    text: `Rahul Verma
rahul.verma@example.com
Pune, Maharashtra
Final-year CS student looking for a junior backend role. Familiar with Python, FastAPI and SQL.
EXPERIENCE
Intern, DataLane Analytics — 2025-01 to 2025-06 (6 months)
Built REST endpoints with FastAPI, connected to SQLite, added pytest coverage.
SKILLS
Python, FastAPI, SQL, Git, Linux
EDUCATION
B.E. Information Technology, University of Pune — 2026`,
  },
  {
    name: 'resume-3-career-switch.txt',
    schema: 'resume',
    text: `MEERA IYER
meera.iyer@example.com | Hyderabad
Former accountant transitioning to backend development. Completed two full-stack bootcamps.
EXPERIENCE
Junior Developer, LedgerLite — 2024-09 to 2025-12 (15 months)
Maintained a Django REST API for invoice parsing; wrote PostgreSQL queries and Celery tasks.
Accountant, Rao & Co — 2020-07 to 2023-08 (37 months)
Managed monthly ledgers and reconciliations.
SKILLS
Python, Django, PostgreSQL, Celery, REST APIs
EDUCATION
B.Com, Osmania University — 2020. Bootcamp: Full-Stack Engineering, 2024`,
  },
  {
    name: 'resume-4-senior.txt',
    schema: 'resume',
    text: `Vikram Desai
vikram.desai@example.com | +91 90000 11122 | Mumbai, India
Staff backend engineer, 9 years building distributed systems and event-driven services.
EXPERIENCE
Staff Engineer, StreamScale — 2021-02 to present (57 months)
Led migration from monolith to Kafka-based event services; owned SLOs for 12 services.
Senior Backend Engineer, Gridly — 2017-08 to 2021-01 (41 months)
Go microservices on Kubernetes, gRPC, Terraform.
SKILLS
Go, Java, Kafka, Kubernetes, gRPC, Terraform, PostgreSQL, Redis
EDUCATION
M.Tech Software Engineering, IIT Bombay — 2017`,
  },
  {
    name: 'resume-5-minimal.txt',
    schema: 'resume',
    text: `Sana Khan
sana.k@example.com
I have worked as a web developer for about 2 years. I know JavaScript, React, and a bit of Node.js.
I studied BCA at Delhi University and graduated in 2023.`,
  },
  {
    name: 'job-1-junior-backend.txt',
    schema: 'job_posting',
    text: `Junior Backend Engineer — Zoho (Remote, India)
Full-time. We are hiring engineers with 0-2 years of experience to join our payments platform.
You will build REST APIs in Node.js, work with PostgreSQL, and write unit tests.
Required: JavaScript/TypeScript, SQL, Git. Preferred: Docker, Redis, AWS.
Salary: 6,00,000 - 9,00,000 INR per year.`,
  },
  {
    name: 'job-2-senior-go.txt',
    schema: 'job_posting',
    text: `Senior Backend Engineer, Cloud Infrastructure — Razorpay (Bengaluru, hybrid)
Permanent, full-time. Own high-throughput Go services on Kubernetes.
Requirements: 5+ years backend experience, Go, distributed systems, Kafka, AWS.
Nice to have: Terraform, gRPC, observability tooling.
Responsibilities: design services, mentor engineers, participate in on-call rotation.
Compensation: 25-35 LPA INR.`,
  },
];
