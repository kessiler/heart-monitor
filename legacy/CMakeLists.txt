cmake_minimum_required(VERSION 2.8)

set(PROJECT "heartMonitor")

project(${PROJECT})

find_package(OpenCV REQUIRED)
include_directories(${OpenCV_INCLUDE_DIRS})

set(SRCDIR "${heartMonitor_SOURCE_DIR}/src" )
set(BINDIR "${heartMonitor_SOURCE_DIR}/bin" )

SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}" )

find_package(OpenCV COMPONENTS opencv_core opencv_ml opencv_imgproc opencv_highgui opencv_objdetect REQUIRED)


set(SOURCE_FILES
    src/main.cpp
    src/Window.cpp 
    src/Window.hpp 
    src/Pulse.cpp 
    src/Pulse.hpp
    src/EvmGdownIIR.cpp 
    src/EvmGdownIIR.hpp
)

set(EXT_FILES
    src/ext/opencv.cpp
    src/ext/opencv.hpp
)
set(PROFILER_FILES
    src/profiler/Profiler.cpp
    src/profiler/Profiler.h
)

source_group("ext" FILES ${EXT_FILES})
source_group("profiler" FILES ${PROFILER_FILES})

add_executable(${PROJECT} ${SOURCE_FILES}
			  ${EXT_FILES}
			  ${PROFILER_FILES})

target_link_libraries(${PROJECT} ${OpenCV_LIBS} )

INSTALL(TARGETS ${PROJECT} DESTINATION ${BINDIR} )