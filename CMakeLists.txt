cmake_minimum_required(VERSION 2.8)

project(heartMonitor)

find_package(OpenCV REQUIRED)
include_directories(${OpenCV_INCLUDE_DIRS})

set(SRCDIR "${heartMonitor_SOURCE_DIR}/src" )
set(BINDIR "${heartMonitor_SOURCE_DIR}/bin" )

SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}" )

find_package(OpenCV COMPONENTS opencv_core opencv_ml opencv_imgproc opencv_highgui opencv_objdetect REQUIRED)

add_executable(heartmonitor 	src/main.cpp 
				src/Window.cpp 
                                src/Pulse.cpp
				src/EvmGdownIIR.cpp
                                src/profiler/Profiler.cpp
				src/ext/opencv.cpp)

target_link_libraries(heartmonitor ${OpenCV_LIBS} )

INSTALL(TARGETS heartmonitor DESTINATION ${BINDIR} )


