.PHONY: proto test type-check format lint clean

PROTO_DIR   := ../../packages/proto/src/proto
OUT_DIR     := clawdb/_proto

proto:
	mkdir -p $(OUT_DIR)
	python -m grpc_tools.protoc \
		-I$(PROTO_DIR) \
		--python_out=$(OUT_DIR) \
		--grpc_python_out=$(OUT_DIR) \
		--pyi_out=$(OUT_DIR) \
		$(PROTO_DIR)/*.proto
	touch $(OUT_DIR)/__init__.py

test:
	pytest tests/ -v --tb=short

type-check:
	mypy clawdb/ --ignore-missing-imports --strict

format:
	ruff format clawdb/ tests/

lint:
	ruff check clawdb/ tests/ --fix

clean:
	rm -rf dist/ build/ *.egg-info clawdb/_proto/*_pb2*.py clawdb/_proto/*_pb2_grpc*.py
