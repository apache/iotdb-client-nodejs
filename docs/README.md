# Documentation Index

This directory contains comprehensive documentation for the Apache IoTDB Node.js client.

## 📚 Documentation Categories

### 📋 Documentation Overview
- **[Documentation Review Complete](DOCUMENTATION_REVIEW_COMPLETE.md)** - Complete review and organization report (EN)
- **[Documentation Summary (中文)](DOCUMENTATION_SUMMARY_ZH.md)** - 文档审查和组织总结

### Getting Started
- [Main README](../README.md) - Project overview, installation, and quick start
- [Contributing Guidelines](../CONTRIBUTING.md) - How to contribute to the project
- [Changelog](../CHANGELOG.md) - Version history and release notes

### API & Usage
- [Implementation Guide](implementation.md) - Architecture and core components
- [Data Types](data-types.md) - Supported data types and usage
- [TypeScript Examples](typescript-examples.md) - TypeScript usage examples
- [Thrift Documentation](thrift.md) - Thrift code generation and definitions
- [SessionDataSet Guide](sessiondataset-guide.md) - Iterator pattern for query results
- [Tablet Interfaces](tablet-interfaces.md) - TreeTablet vs TableTablet guide
- [ColumnCategory Usage](COLUMNCATEGORY_USAGE.md) - Table model column categories

### User Guides
- **Tree Model (Timeseries)**
  - [English](user-guide-tree.md) - Tree model user guide
  - [中文](user-guide-tree-zh.md) - 树模型用户指南
- **Table Model (Relational)**
  - [English](user-guide-table.md) - Table model user guide
  - [中文](user-guide-table-zh.md) - 表模型用户指南

### Performance & Optimization
- **[Performance Documentation Index](PERFORMANCE_INDEX.md)** ⭐ **START HERE for performance**
- [Performance Guide](performance-guide.md) - Optimization guide with benchmarks and best practices
- [pg-Inspired Optimizations](pg-inspired-optimizations.md) - Implementation details of pg nodejs patterns
- [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) - Analysis of pool optimization testing
- [Redirection Design](redirection-design.md) - Client-side redirection optimization

### Development
- [Build Infrastructure](development/build-infrastructure.md) - Build system analysis
- [Debugging E2E Tests](development/debugging-e2e.md) - E2E testing guide
- [Test Database Reference](development/test-database.md) - Test database setup

### Project Information
- [Project Status](project-status.md) - Implementation status and roadmap
- [Planning Document](plan.md) - Detailed project planning and architecture decisions
- [E2E Test Status](../E2E_TEST_STATUS.md) - End-to-end testing status
- [Tablet Refactoring Summary](../TABLET_REFACTORING_SUMMARY.md) - Summary of tablet interface changes

## 🔗 Quick Links

### For Users
- **New to IoTDB?** Start with the [Main README](../README.md)
- **Using TypeScript?** Check [TypeScript Examples](typescript-examples.md)
- **Querying data?** See [SessionDataSet Guide](sessiondataset-guide.md)
- **Need specific data types?** See [Data Types](data-types.md)
- **Using tree model?** See [Tree Model User Guide](user-guide-tree.md) or [中文版](user-guide-tree-zh.md)
- **Using table model?** See [Table Model User Guide](user-guide-table.md) or [中文版](user-guide-table-zh.md)
- **Want better performance?** Check [Performance Guide](performance-guide.md)

### For Contributors
- **Want to contribute?** Read [Contributing Guidelines](../CONTRIBUTING.md)
- **Building the project?** See [Build Infrastructure](development/build-infrastructure.md)
- **Running tests?** Check [Debugging E2E Tests](development/debugging-e2e.md)
- **Understanding optimizations?** See [pg-Inspired Optimizations](pg-inspired-optimizations.md)

### For Developers
- **Understanding the code?** Read [Implementation Guide](implementation.md)
- **Working with Thrift?** See [Thrift Documentation](thrift.md)
- **Project roadmap?** Check [Project Status](project-status.md)
- **Performance internals?** See [pg-Inspired Optimizations](pg-inspired-optimizations.md)

## 📖 Documentation Structure

```
docs/
├── README.md                          # This file
├── implementation.md                  # Architecture & implementation
├── data-types.md                      # Data type reference
├── typescript-examples.md             # TypeScript usage
├── thrift.md                          # Thrift generation
├── sessiondataset-guide.md            # Query result handling
├── tablet-interfaces.md               # TreeTablet vs TableTablet
├── COLUMNCATEGORY_USAGE.md            # Column categories
├── performance-guide.md               # Performance optimization guide
├── pg-inspired-optimizations.md       # pg nodejs patterns implementation
├── redirection-design.md              # Client-side redirection
├── user-guide-tree.md                 # Tree model guide (EN)
├── user-guide-tree-zh.md              # Tree model guide (中文)
├── user-guide-table.md                # Table model guide (EN)
├── user-guide-table-zh.md             # Table model guide (中文)
├── project-status.md                  # Project status
├── plan.md                            # Project planning
└── development/                       # Development guides
    ├── build-infrastructure.md
    ├── debugging-e2e.md
    └── test-database.md

Root level summaries:
├── PERFORMANCE_ANALYSIS_SUMMARY.md    # Pool optimization testing analysis
├── E2E_TEST_STATUS.md                 # E2E testing status
└── TABLET_REFACTORING_SUMMARY.md      # Tablet interface changes
```

## 🚀 Additional Resources

- [GitHub Workflows](../.github/workflows/README.md) - CI/CD documentation
- [Benchmark Tools](../benchmark/README.md) - Performance testing tools
- [Examples](../examples/) - Code examples and samples
- [Thrift Schema](../thrift/README.md) - Thrift schema documentation
- [Apache IoTDB Documentation](https://iotdb.apache.org/UserGuide/Master/API/Programming-NodeJS-Native-API.html)

## 📝 Contributing to Documentation

Found an error or want to improve the documentation? Please:

1. Check our [Contributing Guidelines](../CONTRIBUTING.md)
2. Open an issue or submit a pull request
3. Follow the documentation style guide (keep it clear, concise, and helpful)

---

**Last Updated:** 2026-02-03
