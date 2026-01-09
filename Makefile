.PHONY: dev deploy setup db-init db-init-remote db-seed db-seed-remote test test-e2e lint type-check clean

setup:
	cp .dev.vars.example .dev.vars 2>/dev/null || true
	npm install
	npm run db:init
	npm run db:seed

dev:
	npm run dev

deploy:
	npm run deploy

db-init:
	npm run db:init

db-init-remote:
	npm run db:init:remote

db-seed:
	npm run db:seed

db-seed-remote:
	npm run db:seed:remote

test:
	npm run test

test-e2e:
	npm run test:e2e

lint:
	npm run lint

type-check:
	npm run type-check

clean:
	rm -rf dist node_modules/.vite
